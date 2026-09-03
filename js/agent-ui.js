/* =========================================================================
   VERBATIM · Agent status (direct access from the page)
   Mirrors whisper-ui.js for the interviewer's llama.cpp server:
     - polls the OpenAI-style /v1/models endpoint while agent = remote,
     - shows/hides a status card accordingly,
     - displays WHICH model is loaded (llama-server sends CORS headers,
       so the name is readable even from file://),
     - offers a one-click "copy launch command" button.
   ========================================================================= */
(function () {
  "use strict";

  const CMD = "~/ia/run-agent.sh";
  const TICK = 2500;

  function T(key) {
    const L = (window.I18N && window.I18N.getLocale ? window.I18N.getLocale() : "es") || "es";
    const m = (window.I18N_STRINGS && window.I18N_STRINGS[key]) || {};
    return m[L] || m.es || "";
  }

  /* Derive the models endpoint from whatever chat URL is configured. */
  function modelsUrl() {
    const inp = document.getElementById("cfg-llm");
    let url = (inp && inp.value && inp.value.trim()) ||
              (window.Config && window.Config.get && window.Config.get().llmUrl) ||
              "http://localhost:8080/v1/chat/completions";
    let base = url.replace(/\/v1\/chat\/completions\/?$/, "")
                  .replace(/\/chat\/completions\/?$/, "")
                  .replace(/\/v1\/?$/, "");
    return base + "/v1/models";
  }

  /* Accept both OpenAI ({data:[{id}]}) and Ollama-style ({models:[{name}]}) */
  function extractModel(j) {
    if (!j) return "";
    if (j.data && j.data[0]) return j.data[0].id || j.data[0].model || "";
    if (j.models && j.models[0]) return j.models[0].name || j.models[0].model || "";
    return "";
  }
  function basename(p) { return String(p).split("/").pop(); }

  /* Returns model name when reachable, "" when up-but-unparsed, null when down. */
  async function check() {
    try {
      const res = await fetch(modelsUrl(), { cache: "no-store" });
      if (!res || !res.ok) return null;
      const j = await res.json().catch(function () { return null; });
      return extractModel(j) || "";
    } catch (e) { return null; }
  }

  async function update() {
    const sel = document.getElementById("cfg-agent");
    const card = document.getElementById("agent-launch-card");
    if (!sel || !card) return;
    if (sel.value !== "remote") { card.classList.add("hidden"); return; }
    card.classList.remove("hidden");
    const model = await check();
    const up = model !== null;
    card.classList.toggle("on", up);
    const line = document.getElementById("agent-status-line");
    if (line) line.textContent = up ? T("s_agent_status_up") : T("s_agent_status_down");
    const nameEl = document.getElementById("agent-model-name");
    if (nameEl) {
      nameEl.textContent = model ? basename(model) : "";
      nameEl.classList.toggle("hidden", !model);
    }
  }

  /* Copy the launch command with a short visual confirmation. */
  function copyCommand() {
    const btn = document.getElementById("agent-copy");
    const done = function () {
      if (!btn) return;
      btn.querySelector(".wl-label").textContent = "✓ Copiat";
      setTimeout(function () { btn.querySelector(".wl-label").textContent = T("s_copy_launch"); }, 1600);
    };
    function fallback() {
      const ta = document.createElement("textarea"); ta.value = CMD; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.parentNode.removeChild(ta);
    }
    if (navigator.clipboard) navigator.clipboard.writeText(CMD).then(done, fallback);
    else fallback();
  }

  function start() {
    update();
    setInterval(update, TICK);
    const sel = document.getElementById("cfg-agent");
    if (sel) sel.addEventListener("change", update);
    const inp = document.getElementById("cfg-llm");
    if (inp) inp.addEventListener("input", update);
    const btn = document.getElementById("agent-copy");
    if (btn) btn.addEventListener("click", copyCommand);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
