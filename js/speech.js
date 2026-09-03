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

  /* ---------------- TTS ---------------- */
  let _lastQuestion = "";
  function currentLocale() {
    return (window.I18N && window.I18N.getLocale()) || "es";
  }
  function tts(text, opts) {
    opts = opts || {};
    if (!window.speechSynthesis) return Promise.resolve();
    if (!text) return Promise.resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG[currentLocale()] || "es-ES";
    const cfg = window.Config ? window.Config.get() : {};
    if (cfg.tts) u.voice = findVoice(cfg.tts);
    u.rate = 0.98; u.pitch = 1;
    return new Promise(function (res) {
      u.onend = res; u.onerror = res;
      // safety net: resolve after a generous upper bound
      setTimeout(res, Math.max(4000, text.length * 60 + 3000));
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
      // honor the user's microphone choice (settings drawer); empty => system default
      const audio = cfg.micId ? { deviceId: { exact: cfg.micId } } : true;
      stream = await navigator.mediaDevices.getUserMedia({ audio: audio });
      const mime = pickMime();
      const opts = mime.type ? { type: mime.type } : {};
      recorder = new MediaRecorder(stream, opts);
      recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async function () {
        if (done) return; done = true;
        const blob = new Blob(chunks, { type: mime.type || "audio/webm" });
        const fd = new FormData();
        fd.append("file", blob, "recording.webm");
        try {
          const headers = {};
          if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;
          const res = await fetch(cfg.whisperUrl, { method: "POST", headers: headers, body: fd });
          const j = await res.json().catch(function () { return {}; });
          const text = j.text || j.transcript || "";
          if (resolveFn) resolveFn(text);
        } catch (e) {
          if (resolveFn) resolveFn("");
        }
      };
    }
    return {
      start: async function () {
        try { await capture(); if (recorder) recorder.start(); }
        catch (e) { if (resolveFn) resolveFn(""); }
      },
      stop: function () {
        return new Promise(function (res) {
          if (done) return res("");
          resolveFn = function (t) { res(t || ""); };
          if (recorder && recorder.state !== "inactive") recorder.stop();
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
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

  window.Speech = {
    tts: tts,
    setLastQuestion: function (t) { _lastQuestion = t; },
    getLastQuestion: function () { return _lastQuestion; },
    transcribe: function (lang, onTick) { return activeTranscription(lang, onTick); },
    canRecord: function () { return hasWebSpeech() || hasMediaRecorder(); },
    canTranscribe: canTranscribe,
    whisperConfigured: whisperConfigured,
    LANG: LANG
  };
})();
