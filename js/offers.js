/* =========================================================================
   VERBATIM · Offer mode
   Registry and state for per-offer interview sets (apply/sets/<empresa>.json
   compiled into window.OFFER_SETS by scripts/build-offer-sets.py, or loaded
   as a .json file from the settings drawer).

   Three capabilities, one state machine:
     - offer mode : the active set's gaps drive the interview (builtin serves
                    literal questions; remote gets the brief in its prompt)
     - stages     : filter the set's questions to one process stage
     - STAR drill : the interviewer plays a hiring manager over the set's
                    stories; the client owns the story pointer (2 turns per
                    story: opening, then action+result/metric probe)

   No DOM access except document.dispatchEvent — unit-testable in Node with
   a `window` stub. All copy inside sets/questions is bilingual by
   construction ({es,en}); UI labels live in i18n.js.
   ========================================================================= */
(function () {
  "use strict";

  const state = {
    sets: {},        // id -> set object (validated)
    activeId: "",    // "" => offer mode off
    stageId: "",     // "" => all stages
    star: false,     // STAR drill on/off
    starIndex: 0,    // current story index
    starTurn: 1      // 1 = opening, 2 = action+result probe
  };

  function tx(obj, lang) {
    if (!obj) return "";
    return obj[lang] || obj.es || obj.en || "";
  }

  function emit() {
    try {
      if (typeof document !== "undefined" && document.dispatchEvent) {
        document.dispatchEvent(new CustomEvent("offer-changed", { detail: snapshot() }));
      }
    } catch (e) { /* never block the session on an event */ }
  }

  function snapshot() {
    const a = active();
    return {
      id: state.activeId,
      stageId: state.stageId,
      star: state.star,
      company: a ? a.company : "",
      stages: a && Array.isArray(a.stages) ? a.stages.map(function (s) { return s.id; }) : []
    };
  }

  /* Keep Questions in sync with the active set: its pool becomes the set's
     literal questions; labels feed the remote "TEMAS PERMITIDOS" line. */
  function syncPool() {
    if (!window.Questions || !window.Questions.setOfferPool) return;
    const a = active();
    if (!a) { window.Questions.clearOfferPool(); return; }
    const lang = (window.I18N && window.I18N.getLocale) ? window.I18N.getLocale() : "es";
    const st = stage();
    const labels = [st ? tx(st.label, lang) : a.company];
    (a.gaps || []).forEach(function (g) { if (g && g.topic) labels.push(g.topic); });
    try { window.Questions.setOfferPool(poolForStage(), labels); }
    catch (e) { /* pool is an optimization: never block the session on it */ }
  }

  function active() {
    return state.activeId ? (state.sets[state.activeId] || null) : null;
  }

  function langOf(lang) { return lang === "en" ? "en" : "es"; }

  /* ---------------- validation (mirror of build-offer-sets.py) --------- */
  function isL10n(v) {
    return !!v && typeof v === "object" &&
      typeof v.es === "string" && v.es.trim() &&
      typeof v.en === "string" && v.en.trim();
  }
  function validateSet(data) {
    const problems = [];
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return ["root is not an object"];
    }
    if (typeof data.id !== "string" || !data.id.trim()) problems.push("id missing");
    if (typeof data.company !== "string" || !data.company.trim()) problems.push("company missing");
    if (!isL10n(data.role)) problems.push("role missing {es,en}");
    if (!isL10n(data.brief)) problems.push("brief missing {es,en}");
    if (!Array.isArray(data.stages) || !data.stages.length) {
      problems.push("stages must be a non-empty array");
    } else {
      const ids = {};
      data.stages.forEach(function (s, i) {
        if (!s || typeof s !== "object") { problems.push("stages[" + i + "] not an object"); return; }
        if (typeof s.id !== "string" || !s.id.trim()) problems.push("stages[" + i + "].id missing");
        else if (ids[s.id]) problems.push("stages[" + i + "].id duplicated: " + s.id);
        else ids[s.id] = true;
        if (!isL10n(s.label)) problems.push("stages[" + i + "].label missing {es,en}");
        const qs = s.questions;
        if (!Array.isArray(qs) || !qs.length) problems.push("stages[" + i + "].questions empty");
        else qs.forEach(function (q, j) {
          if (!isL10n(q)) problems.push("stages[" + i + "].questions[" + j + "] missing {es,en}");
        });
      });
    }
    (data.stories || []).forEach(function (st, i) {
      const p = "stories[" + i + "]";
      if (!st || typeof st !== "object") { problems.push(p + " not an object"); return; }
      if (typeof st.id !== "string" || !st.id.trim()) problems.push(p + ".id missing");
      if (!isL10n(st.label)) problems.push(p + ".label missing {es,en}");
      ["situation", "task", "action", "result"].forEach(function (f) {
        if (!isL10n(st[f])) problems.push(p + "." + f + " missing {es,en}");
      });
    });
    return problems;
  }

  /* ---------------- public API ---------------- */
  function list() {
    return Object.keys(state.sets).sort().map(function (id) {
      const s = state.sets[id];
      return { id: id, company: s.company, role: s.role };
    });
  }

  function registerSet(obj, srcName) {
    const problems = validateSet(obj);
    if (problems.length) {
      throw new Error((srcName || "set") + ": " + problems.join("; "));
    }
    state.sets[obj.id] = obj;
    return obj.id;
  }

  function setActive(id) {
    state.activeId = (id && state.sets[id]) ? id : "";
    if (!state.activeId) {
      state.stageId = "";
      if (state.star) state.star = false; // STAR needs an active set (R4.4)
    } else if (state.stageId && !stage()) {
      state.stageId = "";
    }
    resetStarPtr();
    syncPool();
    emit();
    return !!state.activeId;
  }

  function setStage(stageId) {
    /* validate against the set's stages directly — stage() reads
       state.stageId, which is still the previous one at this point */
    const a = active();
    const exists = !!(a && Array.isArray(a.stages) && stageId &&
      a.stages.some(function (s) { return s.id === stageId; }));
    state.stageId = exists ? stageId : "";
    resetStarPtr();
    syncPool();
    emit();
  }

  function stage() {
    const a = active();
    if (!a || !state.stageId || !Array.isArray(a.stages)) return null;
    return a.stages.filter(function (s) { return s.id === state.stageId; })[0] || null;
  }

  /* Returns true when the toggle stuck. A visible notice + standard behavior
     is the caller's job when it returns false (R4.4). */
  function setStar(on) {
    const a = active();
    const ok = !on || (!!a && Array.isArray(a.stories) && a.stories.length > 0);
    if (!ok) return false;
    state.star = !!on;
    resetStarPtr();
    emit();
    return true;
  }

  function isStar() { return state.star && !!active(); }

  function resetStarPtr() { state.starIndex = 0; state.starTurn = 1; }

  function storyTurn() {
    if (!isStar()) return null;
    const a = active();
    const stories = a.stories || [];
    if (state.starIndex >= stories.length) return null; // drill exhausted
    return {
      story: stories[state.starIndex],
      index: state.starIndex,
      turn: state.starTurn,
      total: stories.length
    };
  }

  function advanceStarTurn() {
    if (!isStar()) return;
    const a = active();
    const total = (a.stories || []).length;
    if (state.starTurn >= 2) {
      state.starTurn = 1;
      state.starIndex = Math.min(state.starIndex + 1, total);
    } else {
      state.starTurn = 2;
    }
  }

  /* Session length: stories × 2 turns, capped at the reel's 10 segments. */
  function sessionGoal() {
    if (!isStar()) return 6;
    const total = (active().stories || []).length;
    return Math.max(1, Math.min(total * 2, 10));
  }

  /* Question pool for Questions.setOfferPool: literal {es,en} questions of
     the selected stage, or of every stage when none selected. */
  function poolForStage() {
    const a = active();
    if (!a || !Array.isArray(a.stages)) return [];
    const st = stage();
    const stages = st ? [st] : a.stages;
    const pool = [];
    stages.forEach(function (s) {
      (s.questions || []).forEach(function (q, j) {
        if (q && typeof q.es === "string" && typeof q.en === "string") {
          /* fresh objects with deterministic ids: Questions dedups by id and
             may decorate entries — never mutate the registry's own data */
          pool.push({ id: s.id + "_" + j, cat: ["offer"], es: q.es, en: q.en });
        }
      });
    });
    return pool;
  }

  /* Additive block for the remote interviewer prompt: who we are interviewing
     for and which gaps to probe. Empty string when offer mode is off. */
  function contextForPrompt(lang) {
    const a = active();
    if (!a) return "";
    const L = langOf(lang);
    const es = L === "es";
    const lines = [];
    lines.push((es ? "OFERTA ACTIVA: " : "ACTIVE OFFER: ") + a.company + " — " + tx(a.role, L));
    lines.push(tx(a.brief, L));
    if (Array.isArray(a.gaps) && a.gaps.length) {
      lines.push(es ? "GAPS A EXPLORAR (alterna entre ellos, no los amontones en una pregunta):"
                    : "GAPS TO PROBE (alternate between them, never pile them into one question):");
      a.gaps.forEach(function (g) {
        if (g && g.topic) lines.push("• " + g.topic + ": " + tx(g.probe, L));
      });
    }
    const st = stage();
    if (st) {
      lines.push((es ? "FOCO DEL STAGE ACTUAL (" : "CURRENT STAGE FOCUS (") + tx(st.label, L) + "): " + tx(st.focus, L));
    }
    return lines.join("\n");
  }

  /* Full system prompt for the remote STAR interviewer: hiring-manager
     persona + the current story as private notes + this turn's instruction. */
  function storyForPrompt(lang) {
    const t = storyTurn();
    if (!t) return "";
    const L = langOf(lang);
    const es = L === "es";
    const st = t.story;
    const lines = [];
    lines.push(es
      ? "Eres un hiring manager senior, cercano pero exigente, en una entrevista para " +
        active().company + ". Habla SIEMPRE en castellano. En cada turno envías EXACTAMENTE UNA pregunta o petición, corta y directa. No resumas, no hagas listas, no uses comillas."
      : "You are a senior hiring manager, warm but demanding, interviewing a candidate for " +
        active().company + ". ALWAYS speak in English. On each turn return EXACTLY ONE question or prompt — short and direct. Do not summarize, do not list, do not use quotes.");
    lines.push(es
      ? "MODO STAR DRILL: trabajamos las historias del candidato una a una, formato Resultado-Acción-Métrica. No aceptes generalidades."
      : "STAR DRILL MODE: we work through the candidate's stories one at a time, Result-Action-Metric format. Do not accept generalities.");
    lines.push((es ? "HISTORIA " : "STORY ") + (t.index + 1) + "/" + t.total + ": " + tx(st.label, L));
    lines.push(es
      ? "Tus notas privadas (NO se las reveles; son para comprobar qué cubre el candidato):"
      : "Your private notes (do NOT reveal them; use them to check what the candidate covers):");
    lines.push("• " + (es ? "Situación: " : "Situation: ") + tx(st.situation, L));
    lines.push("• " + (es ? "Tarea: " : "Task: ") + tx(st.task, L));
    lines.push("• " + (es ? "Acción esperada: " : "Expected action: ") + tx(st.action, L));
    lines.push("• " + (es ? "Resultado esperado: " : "Expected result: ") + tx(st.result, L));
    if (t.turn === 1) {
      lines.push(es
        ? "TURNO 1 de 2 para esta historia: pide la historia en contexto — cuál era la situación y qué tenía que conseguir. Una sola petición."
        : "TURN 1 of 2 for this story: ask for the story in context — what the situation was and what they had to achieve. One single prompt.");
    } else {
      lines.push(es
        ? "TURNO 2 de 2 para esta historia: exige su acción concreta (qué hizo ÉL, decisiones propias) y el resultado medible; si no ha dado cifra, pídesela explícitamente. Una sola petición."
        : "TURN 2 of 2 for this story: demand their concrete action (what THEY did, their own decisions) and the measurable result; if no number was given, ask for it explicitly. One single prompt.");
    }
    return lines.join("\n");
  }

  /* Canned manager questions for the offline (builtin) STAR drill — grounded
     in the story label only; the details are what the candidate must supply. */
  function builtinStarQuestion(lang) {
    const t = storyTurn();
    if (!t) return "";
    const L = langOf(lang);
    const label = tx(t.story.label, L);
    if (t.turn === 1) {
      return L === "es"
        ? "Vamos con la historia de " + label + ". Ponme en situación: cuál era el contexto y qué tenías que conseguir."
        : "Let's go through " + label + ". Set the scene: what was the context, and what were you there to achieve?";
    }
    return L === "es"
      ? "Concreta esa historia: qué hiciste TÚ exactamente y con qué resultado medible. Si hubo cifra, dala."
      : "Be specific about that story: what exactly did YOU do, and what was the measurable result? Give the number if there was one.";
  }

  /* Restore persisted state from Config at page init. Silent degradation:
     stale ids simply switch the mode off (same healing philosophy as micId). */
  function applyConfig(cfg) {
    cfg = cfg || {};
    setActive(typeof cfg.offerId === "string" ? cfg.offerId : "");
    setStage(typeof cfg.stageId === "string" ? cfg.stageId : "");
    if (cfg.starMode) setStar(true);
  }

  /* Auto-register the compiled bundle (js/offer-sets.js). Pre-validated by
     the builder, but never let one bad set break the page. */
  if (window.OFFER_SETS && typeof window.OFFER_SETS === "object") {
    Object.keys(window.OFFER_SETS).forEach(function (id) {
      try { registerSet(window.OFFER_SETS[id], "offer-sets.js:" + id); }
      catch (e) { try { console.warn("[offers]", e.message); } catch (e2) {} }
    });
  }

  window.Offers = {
    list: list,
    registerSet: registerSet,
    setActive: setActive,
    active: active,
    setStage: setStage,
    stage: stage,
    setStar: setStar,
    isStar: isStar,
    storyTurn: storyTurn,
    advanceStarTurn: advanceStarTurn,
    sessionGoal: sessionGoal,
    poolForStage: poolForStage,
    contextForPrompt: contextForPrompt,
    storyForPrompt: storyForPrompt,
    builtinStarQuestion: builtinStarQuestion,
    applyConfig: applyConfig,
    _state: state // tests only
  };
})();
