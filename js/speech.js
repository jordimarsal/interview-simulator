/* =========================================================================
   VERBATIM · Speech engine
   - tts(text): speaks a string through the browser's synthesis engine.
   - transcribe(lang): live transcription with two backends behind one API:
       1) Whisper  → MediaRecorder + remote/local server (/v1/audio/transcriptions)
       2) Browser  → Web Speech API (offline, Chromium/Edge)
     Falls back gracefully when neither is available.
   Everything degrades; nothing throws unhandled.
   ========================================================================= */
(function () {
  "use strict";

  const LANG = { es: "es-ES", en: "en-US" };

  function hasWebSpeech() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  function hasMediaRecorder() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }
  function whisperConfigured() {
    const c = (window.Config && window.Config.get()) || {};
    return c.stt === "whisper" && !!(c.whisperUrl && c.whisperUrl.length);
  }
  /* A real transcription backend exists (not just mic hardware). */
  function canTranscribe() {
    const c = (window.Config && window.Config.get()) || {};
    if ((c.stt === "whisper") && hasMediaRecorder()) return true;
    return hasWebSpeech();
  }

  let _currentUtterance = null;
  let _currentAudio = null;

  /* deviceId of the mic currently capturing (recording or mic test);
     empty when nothing is live. Feeds the "en uso" tag in the mic dropdown. */
  let _liveDeviceId = "";
  function noteLiveStream(stream) {
    try {
      const t = stream && stream.getAudioTracks && stream.getAudioTracks()[0];
      const id = t && t.getSettings ? (t.getSettings().deviceId || "") : "";
      _liveDeviceId = id || ((window.Config && window.Config.get().micId) || "");
    } catch (e) { _liveDeviceId = ""; }
  }
  function clearLiveStream() { _liveDeviceId = ""; }

  /* ---------------- mic errors: diagnose, don't guess ----------------
     Every getUserMedia failure used to look like "access denied" (test) or
     nothing at all (recording). Map error names to actionable copy and
     self-heal the one case we can fix: a saved micId that no longer exists
     (browsers rotate deviceIds between sessions; the exact constraint then
     fails forever with OverconstrainedError). */
  function micErrorKey(e) {
    const n = (e && e.name) || "";
    if (n === "NotReadableError" || n === "TrackStartError") return "err_mic_busy";
    if (n === "NotFoundError" || n === "DevicesNotFoundError") return "err_mic_missing";
    if (n === "OverconstrainedError" || n === "ConstraintNotSatisfiedError") return "err_mic_stale";
    return "err_no_mic"; // NotAllowedError / SecurityError / unknown
  }
  function micErrorText(e) { return i18nKey(micErrorKey(e)); }

  function savedMicExists() {
    const cfg = window.Config.get();
    if (!cfg.micId || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return Promise.resolve(true);
    }
    return navigator.mediaDevices.enumerateDevices().then(function (devs) {
      const mics = (devs || []).filter(function (d) { return d.kind === "audioinput" && d.deviceId; });
      if (!mics.length) return true; // permission not granted yet: can't judge
      const saved = mics.filter(function (d) { return d.deviceId === cfg.micId; })[0];
      /* A PipeWire "Monitor of ..." source records the system output, not
         the voice: as wrong as a missing device, heal it the same way. */
      if (saved && /^monitor of /i.test(saved.label || "")) {
        window.Config.set({ micId: "" });
        reportError("err_mic_monitor");
        return false;
      }
      if (saved) return true;
      window.Config.set({ micId: "" }); // stale id: fall back to system default
      reportError("err_mic_stale");
      return false;
    }).catch(function () { return true; });
  }

  /* Open the mic honouring the saved choice. Validate BEFORE opening: a
     stale id fails loudly, but a PipeWire "Monitor of ..." source opens
     fine and records silence — exactly the "no audio detected" trap. */
  function openMicStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(Object.assign(new Error("no mediaDevices"), { name: "NotFoundError" }));
    }
    const tryGum = function (useExact) {
      const cfg = window.Config.get();
      return navigator.mediaDevices.getUserMedia({
        audio: (useExact && cfg.micId) ? { deviceId: { exact: cfg.micId } } : true
      });
    };
    if (!window.Config.get().micId) return tryGum(false);
    return savedMicExists().then(function (usable) { return tryGum(usable); })
      .catch(function (e) {
        if (micErrorKey(e) !== "err_mic_stale") throw e;
        return savedMicExists().then(function (kept) {
          if (kept) throw e; // device still listed: not a stale-id problem
          return tryGum(false);
        });
      });
  }

  /* One-click mic diagnostic: runs every boundary of the capture chain and
     reports each result live via onLine. Ends with a 3 s testMic probe.
     Lines are technical on purpose: they are data, not UI copy. */
  function micDiag(onLine) {
    const out = (typeof onLine === "function") ? onLine : function () {};
    const lines = [];
    function add(k, v) { const l = k + ": " + v; lines.push(l); out(l); }
    const trackInfo = function (t) {
      const s = (t.getSettings && t.getSettings()) || {};
      return "label=" + (t.label || "?") + " id=" + String(s.deviceId || "?").slice(0, 10);
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      add("mediaDevices", "NO DISPONIBLE (¿contexto no seguro?)");
      add("isSecureContext", String(window.isSecureContext));
      return Promise.resolve(lines);
    }
    return navigator.mediaDevices.enumerateDevices().then(function (devs) {
      const mics = (devs || []).filter(function (d) { return d.kind === "audioinput"; });
      add("inputs", mics.length);
      mics.forEach(function (d, i) {
        const tag = /^monitor of /i.test(d.label || "") ? "  <-- MONITOR (sortida, no micro)" : "";
        add("  [" + i + "] " + String(d.deviceId || "").slice(0, 10), (d.label || "<sense label/permís>") + tag);
      });
      const cfg = window.Config.get();
      add("savedMicId", cfg.micId || "<cap, usa default del sistema>");
      if (cfg.micId) add("savedMicPresent", mics.some(function (d) { return d.deviceId === cfg.micId; }));
      const probe = function (audio, tag) {
        return navigator.mediaDevices.getUserMedia({ audio: audio }).then(function (s) {
          const t = s.getAudioTracks()[0];
          const mon = /^monitor of /i.test(t.label || "") ? "  <-- MONITOR: grava la sortida, mai la veu" : "";
          add(tag, "OK " + trackInfo(t) + mon);
          s.getTracks().forEach(function (t) { t.stop(); });
        }).catch(function (e) { add(tag, "ERROR " + e.name + " (" + e.message + ")"); });
      };
      const first = cfg.micId
        ? probe({ deviceId: { exact: cfg.micId } }, "gum(savedId)")
        : probe(true, "gum(default)");
      return first.then(function () { return probe(true, "gum(audio:true)"); });
    })
    .then(function () {
      add("testMic(3s)", "...");
      return window.Speech ? window.Speech.testMic() : null;
    })
    .then(function (r) {
      if (!r) add("testMic", "null");
      else add("testMic", "rms=" + (r.rms || 0).toFixed(4)
        + ((r.rms || 0) < 0.004 ? "  <-- SILENCI (micro equivocat o digital)" : "  <-- senyal OK")
        + (r.device ? "  device=" + r.device : "")
        + (r.text ? "  whisper=«" + r.text.slice(0, 30) + "»" : ""));
    })
    .catch(function (e) { add("diag", "ERROR " + e.name + " (" + e.message + ")"); })
    .then(function () { return lines; });
  }

  /* ---------------- TTS ---------------- */
  let _lastQuestion = "";
  let _voicesWarned = false;
  function currentLocale() {
    return (window.I18N && window.I18N.getLocale()) || "es";
  }
  function tts(text, opts) {
    opts = opts || {};
    if (!text) return Promise.resolve();
    const cfg = window.Config ? window.Config.get() : {};
    /* live-read the drawer controls (same pattern as the server cards) so the
       engine reacts instantly, even before the user presses Save */
    const sel = document.getElementById ? document.getElementById("cfg-tts-engine") : null;
    const engine = opts.engine || (sel && sel.value) || cfg.ttsEngine || "browser";
    const inp = document.getElementById ? document.getElementById("cfg-piper") : null;
    const piperUrl = (inp && inp.value && inp.value.trim()) || cfg.piperUrl;
    if (engine === "piper" && piperUrl) return piperTts(text, { piperUrl: piperUrl });
    return browserTts(text, opts);
  }

  /* Piper (local neural server): POST {text,lang} → audio/wav */
  function piperTts(text, cfg) {
    if (_currentAudio) { try { _currentAudio.pause(); } catch (e) {} }
    return fetch(cfg.piperUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, lang: currentLocale() })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.blob();
    }).then(playBlob).catch(function (e) {
      reportError("err_tts_piper", e && e.message);
      return browserTts(text, {});   // graceful fallback: never leave the turn silent
    });
  }
  function playBlob(blob) {
    return new Promise(function (res) {
      try {
        const audio = new Audio(URL.createObjectURL(blob));
        _currentAudio = audio;
        audio.onended = res;
        audio.onerror = function () { res(); };
        const p = audio.play();
        if (p && p.catch) p.catch(function () { res(); });
        setTimeout(res, 120000); // hard cap
      } catch (e) { res(); }
    });
  }

  function browserTts(text, opts) {
    opts = opts || {};
    if (!window.speechSynthesis) return Promise.resolve();
    if (!text) return Promise.resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG[currentLocale()] || "es-ES";
    const cfg = window.Config ? window.Config.get() : {};
    const voiceURI = (opts && opts.voiceURI) || cfg.tts;
    if (voiceURI) u.voice = findVoice(voiceURI);
    u.rate = 0.98; u.pitch = 1;
    /* voices can arrive asynchronously; only warn if still empty after a grace period */
    if (!_voicesWarned) {
      let voices = [];
      try { voices = speechSynthesis.getVoices() || []; } catch (e) {}
      if (!voices.length) {
        const recheck = function () {
          if (_voicesWarned) return;
          _voicesWarned = true;
          let v2 = [];
          try { v2 = speechSynthesis.getVoices() || []; } catch (e) {}
          if (!v2.length) reportError("err_tts_novoice");
        };
        if (speechSynthesis.addEventListener) {
          try { speechSynthesis.addEventListener("voiceschanged", recheck, { once: true }); } catch (e) {}
        }
        setTimeout(recheck, 1500);
      } else {
        _voicesWarned = true;
      }
    }
    // keep a reference: Chrome may GC the utterance before it fires
    _currentUtterance = u;
    return new Promise(function (res) {
      u.onend = res;
      u.onerror = function (ev) {
        // surfaced so silence is never the only symptom
        const reason = (ev && (ev.error || ev.reason)) || "unknown";
        reportError("err_tts_failed", reason);
        res();
      };
      // safety net: resolve after a generous upper bound
      setTimeout(res, Math.max(4000, text.length * 60 + 3000));
      // small delay after cancel() avoids a Chrome race that swallows utterances
      setTimeout(function () { try { speechSynthesis.speak(u); } catch (e) { res(); } }, 50);
    });
  }
  function findVoice(uri) {
    try { return speechSynthesis.getVoices().filter(function (v) { return v.voiceURI === uri; })[0]; }
    catch (e) { return null; }
  }

  /* ---------------- STT ---------------- */
  let _active = null;   // { kind, stop():Promise<string>, cancel() }

  function startBrowserTranscription(lang, onTick) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = LANG[lang] || "es-ES";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    let pending = "";
    let done = false;
    let resolveFn = null;
    rec.onresult = function (e) {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText ? " " : "") + t;
        else interim += t;
      }
      onTick((finalText + (interim ? " " + interim : "")).trim());
    };
    rec.onerror = function (e) { if (!done) { done = true; if (resolveFn) resolveFn(""); } };
    rec.onend = function () { if (!done) { done = true; if (resolveFn) resolveFn(finalText); } };
    return {
      start: function () { try { rec.start(); } catch (e) {} },
      stop: function () {
        return new Promise(function (res) {
          if (done) return res(finalText);
          resolveFn = function (t) { finalText = t; res(t || ""); };
          try { rec.stop(); } catch (e) {}
          // hard safety net in case onend never fires
          setTimeout(function () { if (!done) { done = true; res(finalText); } }, 6000);
        });
      }
    };
  }

  function startWhisperTranscription(lang, onTick) {
    const cfg = window.Config.get();
    let stream = null;
    let recorder = null;
    const chunks = [];
    let done = false;
    let resolveFn = null;
    async function capture() {
      // honor the user's microphone choice (settings drawer); heal a stale one
      stream = await openMicStream();
      noteLiveStream(stream);
      // a taken/unplugged mic kills the track mid-recording: never die silently
      stream.getAudioTracks().forEach(function (t) {
        t.onended = function () { if (!done) reportError("err_mic_lost"); };
      });
      const mime = pickMime();
      const opts = mime.type ? { type: mime.type } : {};
      recorder = new MediaRecorder(stream, opts);
      recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async function () {
        if (done) return; done = true;
        const blob = new Blob(chunks, { type: mime.type || "audio/webm" });
        try {
          // whisper.cpp only decodes WAV: convert, fall back to raw blob if WebAudio fails
          let payload = blob, name = "recording." + (mime.type.indexOf("mp4") !== -1 ? "mp4" : "webm");
          try {
            payload = await blobToWav16k(blob);
            name = "recording.wav";
            if (payload.__rms !== undefined && payload.__rms < 0.004) {
              reportError("err_mic_silence"); // still posts: whisper may catch faint speech
            }
          } catch (convErr) { reportError("err_stt_convert"); }
          const fd = new FormData();
          fd.append("file", payload, name);
          // whisper auto-detect hallucinates on marginal audio; force the interview language
          fd.append("language", (lang || "es").split("-")[0]);
          const headers = {};
          if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;
          const res = await fetch(cfg.whisperUrl, { method: "POST", headers: headers, body: fd });
          const j = await res.json().catch(function () { return {}; });
          // strip whisper's non-speech event markers: [BEEP], [BLANK_AUDIO], (music)…
          const text = (j.text || j.transcript || "").replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
          if (!res.ok || j.error) {
            reportError("err_stt_failed", j.error || ("HTTP " + res.status));
            if (resolveFn) resolveFn("");
            return;
          }
          if (!text) reportError("err_stt_empty");
          if (resolveFn) resolveFn(text);
        } catch (e) {
          reportError("err_stt_failed", e && e.message);
          if (resolveFn) resolveFn("");
        }
      };
    }
    return {
      start: async function () {
        try { await capture(); if (recorder) recorder.start(); }
        catch (e) {
          // surfaced: a mic that cannot open must say why (busy/missing/denied)
          reportError(micErrorKey(e), (e && e.name) || "");
          if (resolveFn) resolveFn("");
        }
      },
      stop: function () {
        return new Promise(function (res) {
          if (done) return res("");
          resolveFn = function (t) { res(t || ""); };
          if (recorder && recorder.state !== "inactive") recorder.stop();
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
          clearLiveStream();
          setTimeout(function () { if (!done) { done = true; res(""); } }, 8000);
        });
      }
    };
  }
  function pickMime() {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return { type: "audio/webm;codecs=opus" };
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm")) return { type: "audio/webm" };
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/mp4")) return { type: "audio/mp4" };
    return {};
  }

  /* ---------------- WAV conversion (whisper.cpp accepts WAV only) -------
     The server binary has no ffmpeg: webm/mp4 uploads fail with
     {"error":"failed to read audio data"}. The BROWSER can decode its own
     recording, so we resample to 16 kHz mono PCM16 and post a real WAV. */
  function blobToWav16k(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx || !Off) return Promise.reject(new Error("no WebAudio"));
    const tmp = new Ctx();
    return blob.arrayBuffer().then(function (arrayBuf) {
      return decodeBuffer(tmp, arrayBuf);
    }).then(function (audio) {
      const frames = Math.max(1, Math.ceil(audio.duration * 16000));
      const off = new Off(1, frames, 16000);
      const src = off.createBufferSource();
      src.buffer = audio; src.connect(off.destination); src.start();
      return off.startRendering();
    }).then(function (rendered) {
      try { tmp.close(); } catch (e) {}
      const samples = rendered.getChannelData(0);
      const wav = encodeWavPcm16(samples, 16000);
      // RMS diagnostic: near-silence usually means wrong/quiet mic
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      wav.__rms = Math.sqrt(sum / Math.max(1, samples.length));
      return wav;
    }).catch(function (e) {
      try { tmp.close(); } catch (e2) {}
      throw e;
    });
  }
  /* decodeAudioData: promise form everywhere modern; callback form as fallback */
  function decodeBuffer(ctx, arrayBuf) {
    return new Promise(function (resolve, reject) {
      let p = null;
      try { p = ctx.decodeAudioData(arrayBuf, resolve, reject); } catch (e) { reject(e); return; }
      if (p && typeof p.then === "function") p.then(resolve, reject);
    });
  }
  function encodeWavPcm16(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    function str(off, s) { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  function reportError(key, detail) {
    if (window.Speech && typeof window.Speech.onError === "function") {
      window.Speech.onError(i18nKey(key) + (detail ? " (" + detail + ")" : ""));
    }
  }
  function i18nKey(key) {
    const L = (window.I18N && window.I18N.getLocale ? window.I18N.getLocale() : "es") || "es";
    const m = (window.I18N_STRINGS && window.I18N_STRINGS[key]) || {};
    return m[L] || m.es || "";
  }

  /* Manual text fallback */
  function startManualTranscription(onTick) {
    let resolved = false;
    let resolveFn = null;
    onTick(""); // clears any previous
    return {
      start: function () {},
      stop: function () {
        return new Promise(function (res) {
          if (resolved) return res("");
          const val = window.__manualAnswer || "";
          resolved = true;
          if (resolveFn) resolveFn(val);
          res(val || "");
          window.__manualAnswer = "";
        });
      }
    };
  }

  function activeTranscription(lang, onTick) {
    const c = window.Config ? window.Config.get() : {};
    if (c.stt === "whisper" && hasMediaRecorder()) {
      _active = startWhisperTranscription(lang, onTick || function () {});
      _active.start();
      return _active;
    }
    if (hasWebSpeech()) {
      _active = startBrowserTranscription(lang, onTick || function () {});
      _active.start();
      return _active;
    }
    _active = startManualTranscription(onTick || function () {});
    return _active;
  }

  /* Mic test: record ~3 s from the chosen device, report level (+ what
     Whisper hears when configured). `onStart` fires once capture is live
     (used by the drawer to tag the "en uso" mic while testing). Rejects
     with the original error; app.js surfaces it via Speech.micErrorText. */
  function testMic(onStart) {
    const cfg = window.Config.get();
    let captureEnded = false; // intentional stop vs external loss (onended)
    let _lastTestDevice = "";
    return openMicStream().then(function (stream) {
      try { _lastTestDevice = (stream.getAudioTracks()[0] || {}).label || ""; } catch (e) {}
      noteLiveStream(stream);
      stream.getAudioTracks().forEach(function (t) {
        t.onended = function () { if (!captureEnded) { clearLiveStream(); reportError("err_mic_lost"); } };
      });
      if (typeof onStart === "function") { try { onStart(); } catch (e) {} }
      return new Promise(function (resolve) {
        const mime = pickMime();
        const chunks = [];
        let settled = false;
        function finish(r) { if (!settled) { settled = true; captureEnded = true; r.device = r.device || _lastTestDevice; clearLiveStream(); stream.getTracks().forEach(function (t) { t.stop(); }); resolve(r); } }
        const recorder = new MediaRecorder(stream, mime.type ? { type: mime.type } : {});
        recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = async function () {
          try {
            const blob = new Blob(chunks, { type: mime.type || "audio/webm" });
            const wav = await blobToWav16k(blob);
            let text = "";
            if (whisperConfigured()) {
              try {
                const fd = new FormData();
                fd.append("file", wav, "test.wav");
                fd.append("language", (currentLocale() || "es").split("-")[0]);
                const res = await fetch(cfg.whisperUrl, { method: "POST", body: fd });
                const j = await res.json().catch(function () { return {}; });
                text = (j.text || "").replace(/\[[^\]]*\]|\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
              } catch (e) {}
            }
            finish({ rms: wav.__rms || 0, text: text });
          } catch (e) { finish({ rms: 0, text: "" }); }
        };
        recorder.start();
        setTimeout(function () { try { recorder.stop(); } catch (e) { finish({ rms: 0, text: "" }); } }, 3000);
      });
    });
  }

  window.Speech = {
    tts: tts,
    setLastQuestion: function (t) { _lastQuestion = t; },
    getLastQuestion: function () { return _lastQuestion; },
    transcribe: function (lang, onTick) { return activeTranscription(lang, onTick); },
    canRecord: function () { return hasWebSpeech() || hasMediaRecorder(); },
    canTranscribe: canTranscribe,
    whisperConfigured: whisperConfigured,
    testMic: testMic,
    activeMicId: function () { return _liveDeviceId; },
    micErrorText: micErrorText,
    micDiag: micDiag,
    LANG: LANG
  };
})();
