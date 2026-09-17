/* =========================================================================
   VERBATIM · Whisper activation (direct access from the page)
   The browser can't spawn a local process itself, so this module:
     - polls the whisper.cpp health endpoint (/) while STT = whisper,
     - shows/hides an activation card accordingly,
     - offers a one-click "copy launch command" button.
   Everything degrades gracefully on file:// and offline.
   ========================================================================= */
(function () {
  "use strict";

  const HEALTH = "http://localhost:8081/";      // whisper.cpp serves its demo UI here
  const TICK = 2500;

  /* Launch command: absolute path of the in-repo script when the page is
     opened from file:// (interview.html lives at the repo root), so the
     pasted command works from any terminal. Relative otherwise. */
  function launchCmd(script) {
    try {
      if (location.protocol === "file:") {
        const dir = decodeURIComponent(location.pathname.replace(/\/[^/]*$/, ""));
        return "bash " + dir + "/scripts/" + script;
      }
    } catch (e) {}
    return "bash scripts/" + script;
  }

  function T(key) {
    const L = (window.I18N && window.I18N.getLocale ? window.I18N.getLocale() : "es") || "es";
    const m = (window.I18N_STRINGS && window.I18N_STRINGS[key]) || {};
    return m[L] || m.es || "";
  }

  async function isUp() {
    try {
      const r = await fetch(HEALTH, { mode: "no-cors", cache: "no-store" });
      return !!r;
    } catch (e) { return false; }
  }

  function card() { return document.getElementById("whisper-launch-card"); }
  function statusLine() { return document.getElementById("whisper-status-line"); }

  async function update() {
    const sel = document.getElementById("cfg-stt");
    const useWhisper = sel && sel.value === "whisper";
    const c = card(); if (!c) return;
    if (!useWhisper) { c.classList.add("hidden"); return; }
    c.classList.remove("hidden");
    const up = await isUp();
    c.classList.toggle("on", up);
    if (statusLine()) statusLine().textContent = up ? T("s_whisper_status_up") : T("s_whisper_status_down");
  }

  /* Copy the launch command with a short visual confirmation. */
  function copyCommand() {
    const CMD = launchCmd("run-whisper.sh");
    const btn = document.getElementById("whisper-copy");
    const done = () => { if (btn) { btn.querySelector(".wl-label").textContent = T("s_copied"); setTimeout(function(){ btn.querySelector(".wl-label").textContent = T("s_copy_launch"); }, 1600); } };
    const run = function () { navigator.clipboard.writeText(CMD).then(done, function () { fallback(); }); };
    function fallback() {
      const ta = document.createElement("textarea"); ta.value = CMD; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.parentNode.removeChild(ta);
    }
    if (navigator.clipboard) run(); else fallback();
  }

  function start() {
    const code = document.getElementById("whisper-cmd");
    if (code) code.textContent = launchCmd("run-whisper.sh");
    update();
    setInterval(update, TICK);
    const sel = document.getElementById("cfg-stt");
    if (sel) sel.addEventListener("change", update);
    const btn = document.getElementById("whisper-copy");
    if (btn) btn.addEventListener("click", copyCommand);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
