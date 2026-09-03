/* =========================================================================
   VERBATIM · Config provider
   Single source of truth for runtime configuration. Persisted in
   localStorage so the demo works out of the box and local servers can be
   pointed at without code changes. Defaults assume llama.cpp / whisper.cpp
   running on localhost:8080 (their default HTTP port).
   ========================================================================= */
(function () {
  "use strict";

  const STORE = "verbatim.config.v1";

  const DEFAULTS = {
    stt: "browser",          // 'browser' (offline) | 'whisper' (local/cloud server)
    tts: "",                 // voiceURI; empty => browser picks
    ttsEngine: "browser",    // 'browser' | 'piper' (local neural server)
    piperUrl: "http://localhost:8082/tts",
    micId: "",               // deviceId for Whisper recording; empty => system default
    agent: "builtin",        // 'builtin' | 'remote'
    whisperUrl: "http://localhost:8081/inference",
    llmUrl: "http://localhost:8080/v1/chat/completions",
    apiKey: ""
  };

  function load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch (e) { saved = {}; }
    return Object.assign({}, DEFAULTS, saved);
  }
  function save(patch) {
    const next = Object.assign({}, current(), patch);
    localStorage.setItem(STORE, JSON.stringify(next));
    _current = next;
    return next;
  }

  let _current = load();
  function current() { return _current; }

  /* Populate the TTS voice <select> from the browser's available voices. */
  function populateVoices(selectEl) {
    if (!window.speechSynthesis || !speechSynthesisAvailable()) return;
    let voices = [];
    try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; }
    selectEl.innerHTML = "";
    // Prefer a stable subset; keep it readable.
    voices.slice(0, 40).forEach(function (v) {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (_current.tts === v.voiceURI) opt.selected = true;
      selectEl.appendChild(opt);
    });
    if (!voices.length) {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "Default voice";
      selectEl.appendChild(opt);
    }
  }

  function speechSynthesisAvailable() {
    return !!(window.speechSynthesis && ("speechSynthesis" in window));
  }

  /* Populate the microphone <select> from enumerateDevices().
     Labels only arrive once mic permission has been granted, so we make a
     one-shot getUserMedia attempt to unlock them (tracks stopped right
     away). Falls back to numbered generic labels when denied. */
  function populateMics(selectEl, unlockLabels) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    function fill(devices) {
      const mics = (devices || []).filter(function (d) { return d.kind === "audioinput"; });
      selectEl.innerHTML = "";
      const def = document.createElement("option");
      def.value = "";
      def.textContent = i18n("s_mic_default");
      selectEl.appendChild(def);
      mics.forEach(function (d, i) {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || (i18n("s_mic_generic") + " " + (i + 1));
        selectEl.appendChild(opt);
      });
      selectEl.value = (_current.micId && mics.some(function (d) { return d.deviceId === _current.micId; }))
        ? _current.micId : "";
    }
    navigator.mediaDevices.enumerateDevices().then(fill).catch(function () {});
    /* Unlock real device labels: needs one permission grant. Only on user
       intent (opening settings), never on page load. */
    if (!unlockLabels) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      s.getTracks().forEach(function (t) { t.stop(); });
      return navigator.mediaDevices.enumerateDevices();
    }).then(function (d) { if (d) fill(d); }).catch(function () {});
  }

  /* Wire the settings drawer inputs <-> config. Returns nothing; reads live. */
  function wireDrawer(drawer, fields) {
    const open = () => drawer.classList.add("open");
    const close = () => drawer.classList.remove("open");
    fields.load = function () {
      document.getElementById("cfg-stt").value = _current.stt;
      document.getElementById("cfg-agent").value = _current.agent;
      document.getElementById("cfg-whisper").value = _current.whisperUrl;
      document.getElementById("cfg-llm").value = _current.llmUrl;
      document.getElementById("cfg-key").value = _current.apiKey || "";
      populateVoices(document.getElementById("cfg-tts"));
      populateMics(document.getElementById("cfg-mic"));
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
    fields.save = function () {
      const patch = {
        stt: document.getElementById("cfg-stt").value,
        agent: document.getElementById("cfg-agent").value,
        whisperUrl: document.getElementById("cfg-whisper").value.trim(),
        llmUrl: document.getElementById("cfg-llm").value.trim(),
        apiKey: document.getElementById("cfg-key").value.trim(),
        micId: (document.getElementById("cfg-mic") || {}).value || ""
      };
      // voices selected in the drawer
      const vsel = document.getElementById("cfg-tts");
      if (vsel && vsel.value) patch.tts = vsel.value;
      save(patch);
      toast(i18n("s_saved"));
    };
  }

  /* Minimal i18n lookup used by config UI copy. */
  function i18n(key) {
    const L = (window.I18N && window.I18N.getLocale ? window.I18N.getLocale() : "es") || "es";
    const map = (window.I18N_STRINGS && window.I18N_STRINGS[key]) || {};
    return map[L] || map.es || "";
  }

  function initDrawer(drawerBtn, drawer, fields) {
    const open = () => drawer.classList.add("open");
    const close = () => drawer.classList.remove("open");
    drawerBtn.addEventListener("click", open);
    document.getElementById("drawer-backdrop").addEventListener("click", close);
    document.getElementById("drawer-close").addEventListener("click", close);
    document.getElementById("cfg-save").addEventListener("click", () => fields.save());
    document.getElementById("cfg-agent").addEventListener("change", function () {
      populateVoices(document.getElementById("cfg-tts"));
    });
  }

  window.Config = {
    get: current,
    set: save,
    voices: populateVoices,
    mics: populateMics,
    speechSynthesisAvailable: speechSynthesisAvailable,
    initDrawer: initDrawer,
    wireDrawer: wireDrawer,
    i18n: i18n
  };
})();
