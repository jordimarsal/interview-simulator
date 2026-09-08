/* =========================================================================
   VERBATIM · App orchestrator / session state machine
   IDLE -> ASKING -> RECORDING -> (THINKING) -> next turn ... -> FINISHED
   Defensive throughout: if transcription isn't available we fall back to an
   on-screen editor so the flow never hard-blocks.
   ========================================================================= */
(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };
  const L = function () { return (window.I18N && window.I18N.getLocale()) || "es"; };
  const T = function (k) { return (window.I18N_STRINGS && window.I18N_STRINGS[k] && window.I18N_STRINGS[k][L()]) || ""; };

  const S = { IDLE: "idle", ASKING: "asking", RECORDING: "recording", THINKING: "thinking", FINISHED: "finished" };
  let state = S.IDLE;
  let history = [];
  let currentQ = "";
  let lastUserLi = null;
  let activeTranscription = null;
  let answers = [];

  /* ---------------- status / prompt ---------------- */
  const STATUS_KEYS = { idle: "status_idle", asking: "status_agent_speaking", recording: "status_listening", thinking: "status_thinking", finished: "status_done" };
  const STATE_TO_MODE = { idle: "idle", asking: "agent", recording: "you", thinking: "thinking", finished: "done" };
  function setStatus() {
    const pill = $("status-pill");
    pill.setAttribute("data-state", STATE_TO_MODE[state]);
    pill.lastElementChild.textContent = T(STATUS_KEYS[state] || "status_idle");
    updateReel();
  }
  function setPrompt(text) { $("deck-prompt").textContent = text; }

  function updateReel() {
    const reel = $("reel"); if (!reel) return;
    const segs = reel.children;
    for (let i = 0; i < segs.length; i++) segs[i].classList.toggle("on", i < answers.length);
    reel.setAttribute("aria-valuenow", Math.round((answers.length / 6) * 100));
  }

  /* ---------------- orb ---------------- */
  let orb, orbCanvas;
  function initOrb() { orbCanvas = $("orb-canvas"); orb = new window.Orb(orbCanvas); orb.setMode("idle"); }

  /* ---------------- message cards ---------------- */
  function addAgentCard(text) {
    const li = document.createElement("li");
    li.className = "msg msg--agent";
    li.innerHTML =
      '<div class="msg__meta"><span class="who">Entrevistador</span><span class="tier-label mono"></span></div>' +
      '<div class="msg__card">' +
        '<div class="msg__text" data-transcript></div>' +
        '<div class="msg__actions">' +
          '<button type="button" class="mini" data-act="replay"><svg viewBox="0 0 24 24"><use href="#i-replay"/></svg><span class="lbl"></span></button>' +
          '<button type="button" class="mini" data-act="transcript"><svg viewBox="0 0 24 24"><use href="#i-eye"/></svg><span class="lbl"></span></button>' +
        '</div>' +
      '</div>';
    li.querySelector('[data-transcript]').textContent = text;
    li.querySelector('[data-act="replay"]').querySelector(".lbl").textContent = T("btn_replay");
    li.querySelector('[data-act="transcript"]').querySelector(".lbl").textContent = T("btn_show_transcript");
    li.querySelector('[data-act="replay"]').addEventListener("click", function () { if (orb) orb.ripple(); window.Speech.tts(text); });
    li.querySelector('[data-act="transcript"]').addEventListener("click", function () { toggleTranscript(li); });
    $("timeline").appendChild(li); scrollDown();
  }

  function addUserCard(opts) {
    opts = opts || {};
    const li = document.createElement("li");
    li.className = "msg msg--you";
    let body;
    if (opts.manual) {
      body =
        '<div class="msg__meta"><span class="who">Tú</span><span class="tier-label mono">· escribir</span></div>' +
        '<div class="msg__card">' +
          '<textarea class="msg__text" data-transcript placeholder="Escribe tu respuesta aquí…"></textarea>' +
          '<div class="msg__actions"><button type="button" class="btn btn--soft" data-act="send">Enviar respuesta</button></div>' +
        '</div>';
    } else {
      body =
        '<div class="msg__meta"><span class="who">Tú</span><span class="tier-label mono">REC</span></div>' +
        '<div class="msg__card">' +
          '<div class="tier row"><span class="mono" style="width:3ch">0s</span><span class="bar"><i></i></span><span class="mono tier-state">grabando</span></div>' +
          '<div class="msg__text" data-transcript></div>' +
          '<div class="msg__actions">' +
            '<button type="button" class="mini" data-act="rerecord"><svg viewBox="0 0 24 24"><use href="#i-replay"/></svg><span class="lbl"></span></button>' +
            '<button type="button" class="mini" data-act="transcript"><svg viewBox="0 0 24 24"><use href="#i-eye"/></svg><span class="lbl"></span></button>' +
          '</div>' +
        '</div>';
    }
    li.innerHTML = body;
    const textEl = li.querySelector('[data-transcript]');
    if (opts.text) textEl.textContent = opts.text;

    const trBtn = li.querySelector('[data-act="transcript"]');
    if (trBtn) {
      trBtn.querySelector(".lbl").textContent = T("btn_show_transcript");
      trBtn.addEventListener("click", function () { toggleTranscript(li); });
    }
    if (opts.manual) {
      li.querySelector('[data-act="send"]').addEventListener("click", function () {
        const val = textEl.value.trim();
        if (!val) return;
        finalizeAnswer(val); // afterAnswer consumes lastUserLi (review needs the card)
      });
    } else {
      const recBtn = li.querySelector('[data-act="rerecord"]');
      if (recBtn) {
        recBtn.querySelector(".lbl").textContent = T("btn_rerecord");
        recBtn.addEventListener("click", function () { clearLastUser(); startAnswering(); });
      }
    }
    $("timeline").appendChild(li); scrollDown();
    lastUserLi = li;
    return { li: li, textEl: textEl };
  }

  function toggleTranscript(li) {
    const t = li.querySelector('[data-transcript]');
    const btn = li.querySelector('[data-act="transcript"]');
    const hidden = t.style.display === "none";
    t.style.display = hidden ? "" : "none";
    if (btn) btn.querySelector(".lbl").textContent = hidden ? T("btn_show_transcript") : T("btn_hide_transcript");
  }

  function clearLastUser() { if (lastUserLi && lastUserLi.parentNode) lastUserLi.parentNode.removeChild(lastUserLi); lastUserLi = null; }
  function scrollDown() { setTimeout(function () { $("timeline").scrollTop = $("timeline").scrollHeight; }, 30); }

  /* ---------------- flow ---------------- */
  function poseQuestion() {
    state = S.ASKING; setStatus(); setPrompt(T("prompt_asked"));
    if (orb) orb.setMode("agent");
    window.Agent.nextQuestion(history).then(function (q) {
      currentQ = q || "";
      addAgentCard(currentQ);
      history.push({ role: "agent", text: currentQ });
      window.Speech.tts(currentQ);
      if (orb) orb.ripple();
      renderSuggestions(currentQ);
    }).catch(function () { currentQ = T("room_lede"); addAgentCard(currentQ); renderSuggestions(currentQ); });
  }

  /* Coach panel: two candidate answers per question (one from the CV). */
  function renderSuggestions(question) {
    const body = $("coach-body");
    if (!body) return;
    const mode = (window.Agent && window.Agent.mode) || "builtin";
    if (mode !== "remote" || !question) {
      body.innerHTML = '<p class="coach__note"></p>';
      body.firstChild.textContent = T("coach_demo_hint");
      return;
    }
    body.innerHTML = '<p class="coach__note coach__loading"></p>';
    body.firstChild.textContent = T("coach_thinking");
    window.Agent.suggestAnswers(question, L(), history).then(function (s) {
      body.innerHTML = "";
      [["coach_cv", s.cv], ["coach_general", s.general]].forEach(function (pair) {
        const card = document.createElement("div");
        card.className = "coach__card";
        const lbl = document.createElement("div");
        lbl.className = "coach__label";
        lbl.textContent = T(pair[0]);
        const txt = document.createElement("p");
        txt.className = "coach__text";
        txt.textContent = pair[1];
        card.appendChild(lbl);
        card.appendChild(txt);
        body.appendChild(card);
      });
    }).catch(function () {
      body.innerHTML = '<p class="coach__note"></p>';
      body.firstChild.textContent = T("coach_error");
    });
  }

  function startAnswering() {
    if (state === S.RECORDING) return;
    state = S.RECORDING; setStatus(); setPrompt(T("prompt_recording"));
    setMic(true);
    if (orb) orb.setMode("listening");
    if (!window.Speech.canTranscribe()) { addUserCard({ manual: true }); return; }
    const card = addUserCard({});
    activeTranscription = window.Speech.transcribe(L(), function (tick) {
      const bar = liFind(card.li, ".bar > i"), st = liFind(card.li, ".tier-state");
      if (bar) bar.style.width = Math.min(98, (tick.length / 400) * 100) + "%";
      if (st) st.textContent = tick ? Math.max(1, Math.round(tick.length / 2)) + "s" : T("status_listening");
      card.textEl.textContent = tick || "";
    });
    activeTranscription.start();
  }
  function liFind(li, sel) { return li.querySelector(sel); }

  function finalizeAnswer(answerText) {
    if (activeTranscription) {
      activeTranscription.stop().then(function (t) { afterAnswer(t || answerText); });
    } else { afterAnswer(answerText); }
  }

  function afterAnswer(text) {
    text = text || "";
    setMic(false);
    const cardLi = lastUserLi;
    // paint the final transcript into the user's card (whisper path has no live onTick)
    if (cardLi) {
      const t = cardLi.querySelector("[data-transcript]");
      if (t) t.textContent = text || T("s_answer_empty");
    }
    history.push({ role: "user", text: text });
    lastUserLi = null;
    state = S.THINKING; setStatus(); setPrompt(T("prompt_thinking"));
    if (orb) orb.setMode("thinking");
    fireReview(cardLi, currentQ, text);
    window.Agent.evaluateAnswer(currentQ, text).then(done).catch(done);
    function done(result) {
      answers.push({ q: currentQ, a: text, result: result });
      updateReel();
      advance();
    }
  }

  /* Interviewer's assistant notes: bullets of errors/good points rendered
     inside the candidate's own card. Runs in parallel with evaluateAnswer —
     it must never block the next turn. */
  const REVIEW_CATS = { gramatica: "cat_grammar", vocabulario: "cat_vocab", concepto: "cat_concept" };
  function fireReview(li, question, answerText) {
    if (!li || !answerText || !window.Agent || !window.Agent.reviewAnswer) return;
    const host = li.querySelector("[data-transcript]");
    if (!host) return;
    const box = document.createElement("div");
    box.className = "review";
    const loading = document.createElement("p");
    loading.className = "review__loading";
    loading.textContent = T("review_loading");
    box.appendChild(loading);
    host.parentNode.insertBefore(box, host.nextSibling);
    window.Agent.reviewAnswer(question, answerText).then(function (r) {
      if (!li.isConnected) return; // card removed by re-record: drop silently
      renderReview(box, r);
    }).catch(function () {
      if (!li.isConnected) return;
      box.innerHTML = "";
      const p = document.createElement("p");
      p.className = "review__error";
      p.textContent = T("review_error");
      box.appendChild(p);
    });
  }
  function renderReview(box, r) {
    box.innerHTML = "";
    if (!r) return;
    const ul = document.createElement("ul");
    (r.errors || []).forEach(function (e) {
      const item = document.createElement("li");
      item.className = "rv rv--error";
      const tag = document.createElement("span");
      tag.className = "rv__cat";
      tag.textContent = T(REVIEW_CATS[e.cat] || "cat_concept");
      const span = document.createElement("span");
      span.textContent = e.text;
      item.appendChild(tag); item.appendChild(span);
      ul.appendChild(item);
    });
    (r.good || []).forEach(function (g) {
      const item = document.createElement("li");
      item.className = "rv rv--good";
      const span = document.createElement("span");
      span.textContent = g;
      item.appendChild(span);
      ul.appendChild(item);
    });
    if (ul.children.length) box.appendChild(ul);
  }

  function advance() { if (answers.length >= 6) finishSession(); else poseQuestion(); }

  function finishSession() {
    state = S.FINISHED; setStatus(); setPrompt(T("prompt_finished"));
    if (orb) orb.setMode("done");
    showVerdict();
  }

  /* ---------------- verdict ---------------- */
  function gradeFor(score) {
    if (score >= 90) return { es: "Sobresaliente", en: "Outstanding" };
    if (score >= 75) return { es: "Notable", en: "Strong showing" };
    if (score >= 60) return { es: "Bien", en: "Satisfactory" };
    if (score >= 40) return { es: "Suficiente", en: "Developing" };
    return { es: "En formación", en: "Needs work" };
  }
  function animateNumber(el, target) {
    let cur = 0;
    (function step() {
      cur += Math.max(1, Math.ceil((target - cur) / 8));
      if (cur >= target) { el.innerHTML = target + '<small>' + T("verdict_score_label") + '</small>'; return; }
      el.textContent = cur; requestAnimationFrame(step);
    })();
  }
  function showVerdict() {
    const box = $("verdict"); notes = $("verdict-notes");
    box.classList.remove("hidden"); $("deck").style.display = "none";
    const scores = answers.map(function (a) { return a.result.score || 0; });
    const avg = scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0;
    const strengths = [], improves = [];
    answers.forEach(function (a) {
      (a.result.strengths || []).forEach(function (s) { if (strengths.indexOf(s) === -1) strengths.push(s); });
      (a.result.improvements || []).forEach(function (s) { if (improves.indexOf(s) === -1) improves.push(s); });
    });
    const grade = gradeFor(avg);
    animateNumber($("verdict-num"), avg);
    const C = 2 * Math.PI * 42;
    const fill = document.querySelector(".ring-fill");
    if (fill) { fill.style.strokeDasharray = C + " " + C; fill.style.strokeDashoffset = C * (1 - avg / 100); }
    $("verdict-grade").textContent = grade[L()] || "";
    notes.innerHTML = "";
    pushNote(strengths.slice(0, 3), "i-star", T("note_strengths_h"));
    pushNote(improves.slice(0, 3), "i-check", T("note_improve_h"));
    let summaryText = "";
    if (answers.length && answers[answers.length - 1].result.summary) {
      const s = answers[answers.length - 1].result.summary;
      summaryText = (typeof s === "object") ? (s[L()] || "") : s;
    }
    pushSummary(summaryText);
    box.scrollIntoView({ behavior: "smooth" });
  }
  function pushNote(list, iconKey, label) {
    const div = document.createElement("div"); div.className = "note";
    div.innerHTML = '<h4><svg viewBox="0 0 24 24" style="width:1rem;height:1rem"><use href="#'+iconKey+'"/></svg>' + label + '</h4>';
    list.forEach(function (item) { const p = document.createElement("p"); p.textContent = item; div.appendChild(p); });
    $("verdict-notes").appendChild(div);
  }
  function pushSummary(text) {
    const div = document.createElement("div"); div.className = "note";
    div.innerHTML = '<h4>' + T("note_next_h") + '</h4><p></p>';
    div.querySelector("p").textContent = text || "";
    $("verdict-notes").appendChild(div);
  }

  /* ---------------- mic button visuals ---------------- */
  function setMic(recording) {
    const btn = $("mic-btn");
    btn.classList.toggle("recording", recording);
    btn.querySelector("use").setAttribute("href", recording ? "#i-stop" : "#i-mic");
    btn.setAttribute("aria-label", recording ? T("btn_stop") : T("btn_record"));
  }

  /* ---------------- settings drawer ---------------- */
  function loadSettingsIntoDrawer() {
    const c = window.Config.get();
    $("cfg-stt").value = c.stt;
    $("cfg-agent").value = c.agent;
    $("cfg-whisper").value = c.whisperUrl;
    $("cfg-llm").value = c.llmUrl;
    $("cfg-key").value = c.apiKey || "";
    $("cfg-tts-engine").value = c.ttsEngine || "browser";
    $("cfg-piper").value = c.piperUrl || "";
    syncTtsEngineUi();
    window.Config.voices(document.getElementById("cfg-tts"));
    window.Config.mics(document.getElementById("cfg-mic"));
  }

  /* Piper ignores the browser-voice dropdown: hide it while active. */
  function syncTtsEngineUi() {
    const piper = $("cfg-tts-engine").value === "piper";
    document.querySelectorAll(".browser-voice-only").forEach(function (el) {
      el.classList.toggle("hidden", piper);
    });
  }

  /* ---------------- wiring ---------------- */
  function wire() {
    $("mic-btn").addEventListener("click", onMicTap);
    $("btn-replay").addEventListener("click", function () { if (currentQ) { if (orb) orb.ripple(); window.Speech.tts(currentQ); toast(T("btn_replay") + " ▶"); } });
    $("btn-transcript").addEventListener("click", function () {
      const cards = document.querySelectorAll(".msg--agent [data-act='transcript']");
      if (cards.length) cards[cards.length - 1].click();
    });
    $("btn-end").addEventListener("click", finishSession);
    window.Config.initDrawer($("settings-btn"), $("settings-drawer"), {
      load: function () { loadSettingsIntoDrawer(); },
      save: function () {
        const vsel = $("cfg-tts");
        const msel = $("cfg-mic");
        const patch = {
          stt: $("cfg-stt").value,
          agent: $("cfg-agent").value,
          whisperUrl: $("cfg-whisper").value.trim(),
          llmUrl: $("cfg-llm").value.trim(),
          apiKey: $("cfg-key").value.trim(),
          micId: (msel && msel.value) ? msel.value : "",
          ttsEngine: $("cfg-tts-engine").value,
          piperUrl: $("cfg-piper").value.trim(),
          tts: (vsel && vsel.value) ? vsel.value : ""
        };
        window.Config.set(patch);
        toast(window.Config.i18n("s_saved"));
      }
    });
    /* Opening settings refreshes the mic list and (one-shot) unlocks the
       real device labels via a permission grant. */
    $("settings-btn").addEventListener("click", function () {
      window.Config.mics(document.getElementById("cfg-mic"), true);
    });
    /* Hot-plug: keep the mic list fresh while the drawer is open. */
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", function () {
        if ($("settings-drawer").classList.contains("open")) {
          window.Config.mics(document.getElementById("cfg-mic"));
        }
      });
    }
    $("cfg-tts-test").addEventListener("click", function () {
      window.Speech.tts(T("tts_test_phrase"), {
        engine: ($("cfg-tts-engine") && $("cfg-tts-engine").value) || "browser",
        voiceURI: ($("cfg-tts") && $("cfg-tts").value) || ""
      });
    });
    $("cfg-mic-test").addEventListener("click", function () {
      const btn = $("cfg-mic-test");
      if (btn.disabled) return;
      btn.disabled = true;
      toast(T("s_mic_test_rec"));
      const msel = document.getElementById("cfg-mic");
      window.Speech.testMic(function () {
        /* capture is live: tag the recording mic in the dropdown */
        window.Config.mics(msel);
      }).then(function (r) {
        btn.disabled = false;
        window.Config.mics(msel); /* drop the tag once capture ends */
        if (!r) { toast(T("err_no_mic")); return; }
        if (r.rms < 0.004) toast(T("s_mic_test_low"));
        else toast(T("s_mic_test_ok") + (r.device ? " · " + r.device : "") + (r.text ? " · «" + r.text.slice(0, 40) + "»" : ""));
      }).catch(function (e) {
        btn.disabled = false; window.Config.mics(msel);
        toast(window.Speech.micErrorText ? window.Speech.micErrorText(e) : T("err_no_mic"));
      });
    });
    $("cfg-mic-diag").addEventListener("click", function () {
      const btn = $("cfg-mic-diag");
      const out = $("cfg-mic-diag-out");
      if (!window.Speech || !window.Speech.micDiag) return;
      btn.disabled = true;
      out.hidden = false;
      out.textContent = "";
      window.Speech.micDiag(function (line) { out.textContent += line + "\n"; })
        .then(function () { btn.disabled = false; });
    });
    $("cfg-tts-engine").addEventListener("change", syncTtsEngineUi);

    /* Topics selector: rebuild the list, wire changes, sync the agent. */
    const list = $("topics-list");
    if (list) {
      const labels = (window.I18N && window.I18N.getLocale()) === "en" ? "en" : "es";
      list.innerHTML = "";
      window.Questions.TOPICS.forEach(function (t) {
        const label = document.createElement("label");
        label.className = "topic";
        const box = document.createElement("input");
        box.type = "checkbox"; box.value = t.id; box.checked = true;
        const span = document.createElement("span");
        span.textContent = t[labels];
        label.appendChild(box); label.appendChild(span);
        list.appendChild(label);
      });
      const sync = function () {
        const on = Array.prototype.map.call(list.querySelectorAll("input:checked"), function (b) { return b.value; });
        window.Questions.setTopics(on);
      };
      list.addEventListener("change", sync);
      sync();
    }
    document.addEventListener("keydown", function (e) {
      if (e.code !== "Space" || e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      e.preventDefault(); onMicTap();
    });
  }
  function onMicTap() {
    if (state === S.IDLE) poseQuestion();
    else if (state === S.ASKING) startAnswering();
    else if (state === S.RECORDING) finalizeAnswer(null);
  }

  /* ---------------- toast ---------------- */
  function toast(msg) {
    const c = $("toasts"); const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; c.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------------- init ---------------- */
  let notes;
  function init() {
    if (window.Agent) window.Agent.startSession();
    initOrb(); wire(); setStatus(); setPrompt(T("prompt_waiting"));
    loadSettingsIntoDrawer();
    // speech errors surface as toasts instead of silent empty strings
    window.Speech.onError = function (msg) { if (msg) toast(msg); };
  }
  if (document.readyState === "complete" || document.readyState === "interactive") init();
  else window.addEventListener("DOMContentLoaded", init);
})();
