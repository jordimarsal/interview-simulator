/* =========================================================================
   VERBATIM · Interviewer agent
   Two interchangeable brains behind one API:
     - builtin : a heuristic driver + scorer that works fully offline.
     - remote  : any OpenAI-compatible server (llama.cpp / whisper.cpp on
                 localhost:8080, or a cloud provider) drives questions and
                 scoring through /v1/chat/completions.
   Both expose: nextQuestion() and evaluateAnswer().
   ========================================================================= */
(function () {
  "use strict";

  const PROFILE = [
    "Senior back-end engineer (~8 years), Java/Spring Boot specialist with a Master's in Data Science.",
    "Experience building microservices, REST APIs, RabbitMQ, Docker/Kubernetes/CI-CD, and modernizing 39 APIs onto Node.js 24.",
    "Data-driven, values clean code, observability, and mentoring juniors."
  ].join(" ");

  const Q_SYSTEM = {
    es: "Eres un entrevistador técnico senior, amable pero exigente, que entrevista a un candidato a desarrollador backend. Habla SIEMPRE en castellano. En cada turno envías EXACTAMENTE UNA pregunta, natural y concreta, relacionada con el perfil o la respuesta anterior. No resumas, no preguntes dos veces, no uses comillas ni listas. Solo devuelve el texto de la pregunta.",
    en: "You are a senior, friendly but rigorous technical interviewer interviewing a candidate for a back-end developer role. ALWAYS speak in English. On each turn you return EXACTLY ONE question — natural and specific, tied to the profile or to the previous answer. Do not summarize, do not ask two things at once, do not use quotes or lists. Return only the text of the question."
  };
  const EVAL_SYSTEM = {
    es: "Eres un reclutador técnico que valora respuestas de entrevista. Devuelve ÚNICAMENTE un objeto JSON válido (sin código, sin markdown) con este esquema: {\"score\": <número entero 0-100>, \"strengths\": [<string>, ...], \"improvements\": [<string>, ...], \"summary\": <frase corta>}. Valora coherencia, profundidad técnica, ejemplos concretos y comunicación. Sé justo pero honesto.",
    en: "You are a technical recruiter scoring an interview answer. Return ONLY valid JSON (no code fences, no prose) with this schema: {\"score\": <integer 0-100>, \"strengths\": [<string>, ...], \"improvements\": [<string>, ...], \"summary\": <short sentence>}. Reward coherence, technical depth, concrete examples and clear communication. Be fair but honest."
  };

  const COACH_SYSTEM = {
    es: "Eres el coach del candidato durante una entrevista técnica. Escribe SIEMPRE EN CASTELLANO, aunque el perfil esté en otro idioma. Devuelve ÚNICAMENTE un objeto JSON válido (sin código, sin markdown) con este esquema exacto: {\"facts\": [\"...\"], \"cv\": \"...\", \"general\": \"...\"}. PASO 1 — \"facts\": los 1-2 datos del PERFIL DEL CANDIDATO estrictamente relevantes para la pregunta (array de 1-2 frases cortas, tomadas del perfil; nada más). PASO 2 — \"cv\": responde EXACTAMENTE la pregunta desarrollando SOLO esos facts (prohibido añadir otros datos del perfil); si el perfil no tiene datos relevantes, responde de forma general dentro de su experiencia real. MAL (demasiado amplio): mezclar generador OpenAPI + herramientas CLI + programación reactiva en una misma respuesta. BIEN: una sola decisión o sistema, cómo lo hiciste y su impacto. PROHIBIDO inventar cifras o resultados: sin métricas, impacto cualitativo; el carácter % está PROHIBIDO. Máximo 3-4 frases (~60-90 palabras), primera persona, tono natural. \"general\": respuesta modelo alternativa a la pregunta, sólida y sin datos personales, mismas reglas de foco y longitud.",
    en: "You are the candidate's coach during a technical interview. ALWAYS WRITE IN ENGLISH, even if the profile is in another language. Return ONLY a valid JSON object (no code fences, no prose) with this exact schema: {\"facts\": [\"...\"], \"cv\": \"...\", \"general\": \"...\"}. STEP 1 — \"facts\": the 1-2 facts from the CANDIDATE PROFILE strictly relevant to the question (array of 1-2 short phrases taken from the profile; nothing else). STEP 2 — \"cv\": answer EXACTLY the question developing ONLY those facts (adding other profile data is forbidden); if the profile lacks relevant facts, answer generally within their real experience. WRONG (too broad): mixing the OpenAPI generator + CLI tools + reactive programming in one answer. RIGHT: one single decision or system, how you did it, and its impact. NEVER invent numbers or results: no metrics, qualitative impact only; the % character is FORBIDDEN. Max 3-4 sentences (~60-90 words), first person, natural tone. \"general\": an alternative model answer to the question, strong and personal-data-free, same focus and length rules."
  };

  const REVIEW_SYSTEM = {
    es: "Eres el ayudante del entrevistador en una entrevista técnica: tomas notas de la respuesta del candidato mientras habla. Analiza la RESPUESTA respecto a la PREGUNTA hecha y devuelve ÚNICAMENTE un objeto JSON válido (sin código, sin markdown) con este esquema exacto: {\"errors\": [{\"cat\": \"gramatica|vocabulario|concepto\", \"text\": \"...\"}], \"good\": [\"...\"]}. Reglas: máximo 3 errores y 2 aciertos; cada entrada es UNA frase corta (máx ~15 palabras), concreta y accionable, citando la palabra o idea afectada cuando aplique. Categorias (usa SIEMPRE estos tokens): gramatica = concordancia, tiempos verbales, estructura de frase; vocabulario = imprecisión léxica, farcitos, repeticiones; concepto = desvío de la pregunta o error técnico conceptual. Si no hay errores reales, errors queda vacío — nunca inventes fallos. Si todo va bien, incluye al menos un acierto. Escribe SIEMPRE EN CASTELLANO.",
    en: "You are the interviewer's assistant during a technical interview: you take notes on the candidate's answer as they speak. Analyze the ANSWER against the QUESTION asked and return ONLY a valid JSON object (no code fences, no prose) with this exact schema: {\"errors\": [{\"cat\": \"gramatica|vocabulario|concepto\", \"text\": \"...\"}], \"good\": [\"...\"]}. Rules: max 3 errors and 2 good points; each entry is ONE short sentence (max ~15 words), concrete and actionable, quoting the affected word or idea where it applies. Categories (ALWAYS use these tokens): gramatica = agreement, verb tenses, sentence structure; vocabulario = imprecise wording, fillers, repetitions; concepto = drifting from the question or conceptual/technical mistake. If there are no real errors, leave errors empty — never invent faults. If all goes well include at least one good point. ALWAYS WRITE IN ENGLISH."
  };

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------------- builtin heuristic scorer ---------------- */
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function gradeFor(score) {
    if (score >= 90) return { es: "Sobresaliente", en: "Outstanding" };
    if (score >= 75) return { es: "Notable",       en: "Strong showing" };
    if (score >= 60) return { es: "Bien",          en: "Satisfactory" };
    if (score >= 40) return { es: "Suficiente",    en: "Developing" };
    return { es: "En formación", en: "Needs work" };
  }
  function evaluateBuiltin(answer) {
    const clean = (answer || "").trim();
    const words = clean.split(/\s+/).filter(Boolean);
    const wc = words.length;
    const sentences = clean.split(/[.!?]+/).map(function (s) { return s.trim(); }).filter(Boolean).length || 1;
    const unique = new Set(words.map(function (w) { return w.toLowerCase().replace(/[^a-záéíóúñü0-9]/gi, ""); })).size;
    const diversity = wc ? unique / wc : 0;

    // length band (0..1) — rewards genuine development of ideas
    let lenScore;
    if (wc < 5) lenScore = 0.30; else if (wc < 12) lenScore = 0.55; else if (wc < 25) lenScore = 0.80; else lenScore = 1.0;
    // structure band (0..1)
    let structScore = clamp((sentences - 1) / 5, 0, 1);
    // substance: weighted blend of depth signals, with a respectful floor
    let score = Math.round(clamp(
      (0.55 * lenScore + 0.30 * structScore + 0.15 * diversity) * 100 + (wc > 40 ? 9 : wc > 25 ? 4 : 0), 0, 100));
    score = clamp(score, 28, 100);

    const lang = (window.I18N && window.I18N.getLocale()) || "es";
    const L = function (o) { return o[lang] || o.es || ""; };
    const strengths = [];
    const improvements = [];
    if (wc >= 15) strengths.push(L({ es: "Buena extensión y desarrollo de la idea.", en: "Good length and development of the idea." }));
    else if (wc === 0) strengths.push(L({ es: "Respuesta directa al grano.", en: "Gets straight to the point." }));
    else improvements.push(L({ es: "Amplía un poco más la respuesta con un ejemplo concreto.", en: "Expand with one concrete example." }));
    if (diversity > 0.6) strengths.push(L({ es: "Vocabulario variado y técnico.", en: "Varied, technical vocabulary." }));
    else improvements.push(L({ es: "Enriquece le léxico técnico para sonar más preciso.", en: "Use more precise technical language." }));
    if (sentences >= 3) strengths.push(L({ es: "Estructura clara en varias frases.", en: "Clear multi-sentence structure." }));
    else improvements.push(L({ es: "Conecta las ideas en frases completas, no a trozos.", en: "Connect ideas into complete sentences." }));
    if (!strengths.length) strengths.push(L({ es: "Tono natural y cercano.", en: "Natural, relaxed tone." }));

    const summary = wc < 4
      ? { es: "Respuesta corta; da más cuerpo y un ejemplo.", en: "Short answer — add depth and a concrete example." }
      : { es: "Buena base; profundiza en detalles técnicos y métricas.", en: "Solid base — push toward specifics and metrics." };

    return { score: score, strengths: strengths, improvements: improvements, summary: summary, grade: gradeFor(score), builtin: true };
  }

  /* ---------------- remote LLM adapter ---------------- */
  /* opts: { messages, max_tokens, temperature, response_format } */
  async function chat(opts) {
    const cfg = window.Config.get();
    const res = await fetch(cfg.llmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { "Authorization": "Bearer " + cfg.apiKey } : {})
      },
      body: JSON.stringify(Object.assign({ model: "local", temperature: 0.7 }, opts || {}))
    });
    const data = await res.json().catch(function () { return {}; });
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  }
  async function nextQuestionRemote(history, lang) {
    const sys = Q_SYSTEM[lang] || Q_SYSTEM.es;
    const conv = history.slice(-6).map(function (h) {
      return { role: h.role === "agent" ? "assistant" : "user", content: h.text };
    });

    // Include folder context if available
    let folderContext = "";
    if (window.FolderContext && window.FolderContext.hasContent()) {
      folderContext = "\n\nCONTEXTO ADICIONAL DEL CANDIDATO (proyectos/repositorios):\n" + window.FolderContext.getContent();
    }

    const prompt = sys + "\n\nTEMAS PERMITIDOS (alterna entre temas técnicos y no técnicos, sin repetirlos): " +
      (window.Questions.topicLabels(lang).join(", ") || "libre") +
      folderContext +
      "\n\nConversación previa:\n" + conv.map(function (c) {
        return (c.role === "assistant" ? "Entrevistador: " : "Candidato: ") + c.content;
      }).join("\n") || "(sin preguntas previas)";
    const out = await chat({ messages: [{ role: "system", content: sys }, { role: "user", content: prompt }], max_tokens: 120, temperature: 0.9 });
    const clean = strip(out);
    if (!clean) throw new Error("empty question from LLM"); // poseQuestion shows its fallback copy
    return clean;
  }
  async function evaluateRemote(question, answer, lang) {
    const sys = EVAL_SYSTEM[lang] || EVAL_SYSTEM.es;
    const raw = await chat({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: "Pregunta: " + question + "\nResp del candidato: " + answer }
      ],
      response_format: { type: "json_object" }, max_tokens: 300, temperature: 0.5
    });
    let parsed = null;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch (e) {}
    if (!parsed || typeof parsed.score !== "number") {
      // degrade to heuristic if the model misbehaves
      return evaluateBuiltin(answer);
    }
    parsed.grade = gradeFor(parsed.score);
    parsed.builtin = false;
    return parsed;
  }
  async function reviewRemote(question, answer, lang) {
    const sys = REVIEW_SYSTEM[lang] || REVIEW_SYSTEM.es;
    const raw = await chat({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: "Pregunta: " + question + "\nRespuesta del candidato: " + answer }
      ],
      response_format: { type: "json_object" }, max_tokens: 400, temperature: 0.3
    });
    let parsed = null;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch (e) {}
    if (!parsed || !Array.isArray(parsed.errors) || !Array.isArray(parsed.good)) throw new Error("bad review JSON");
    return normalizeReview(parsed);
  }
  /* Both modes feed the same shape to the UI: {errors:[{cat,text}], good:[text]} */
  function normalizeReview(p) {
    const CATS = ["gramatica", "vocabulario", "concepto"];
    const errors = (p.errors || []).filter(function (e) { return e && typeof e.text === "string" && e.text.trim(); })
      .slice(0, 3).map(function (e) {
        const cat = CATS.indexOf(e.cat) !== -1 ? e.cat : "concepto";
        return { cat: cat, text: strip(String(e.text)).trim() };
      });
    const good = (p.good || []).filter(function (g) { return typeof g === "string" && g.trim(); })
      .slice(0, 2).map(function (g) { return strip(g).trim(); });
    return { errors: errors, good: good };
  }
  function strip(s) { return (s || "").replace(/^["'\s\u201C\u201E]+|["'\s\u201D\u2019]+$/g, "").trim(); }

  /* ---------------- builtin review heuristics ----------------
     Offline stand-in for the LLM reviewer: only flags what is measurable
     from the raw text (length, fillers, repetition), never invented faults. */
  function reviewBuiltin(answer) {
    const lang = window.I18N ? window.I18N.getLocale() : "es";
    const L = function (o) { return o[lang] || o.es || ""; };
    const clean = String(answer || "").trim();
    const words = clean.split(/\s+/).filter(Boolean);
    const wc = words.length;
    const sentences = clean.split(/[.!?]+/).map(function (s) { return s.trim(); }).filter(Boolean).length || 1;
    const unique = new Set(words.map(function (w) { return w.toLowerCase().replace(/[^a-záéíóúñü0-9]/gi, ""); })).size;
    const diversity = wc ? unique / wc : 0;

    const errors = [];
    const good = [];
    const fillerRe = /\b(ehh?|mmm+|um|uh|like|you know|i mean|o sea)\b/gi;
    const fillers = clean.match(fillerRe);
    if (fillers && fillers.length >= 2) {
      errors.push({ cat: "vocabulario", text: L({ es: "Farcitos repetidos («" + fillers[0].toLowerCase() + "…») — suenan a duda.", en: "Repeated fillers (“" + fillers[0].toLowerCase() + "…”) — sound like hesitation." }) });
    }
    const counts = {};
    words.forEach(function (w) {
      const k = w.replace(/[^a-záéíóúñü0-9]/gi, "").toLowerCase();
      if (k.length >= 5) counts[k] = (counts[k] || 0) + 1;
    });
    let repWord = "", repN = 0;
    for (const k in counts) { if (counts[k] > repN) { repN = counts[k]; repWord = k; } }
    if (repWord && repN >= 4) {
      errors.push({ cat: "vocabulario", text: L({ es: "«" + repWord + "» aparece " + repN + " veces — busca sinónimos.", en: "“" + repWord + "” appears " + repN + " times — vary the wording." }) });
    }
    if (wc < 8) {
      errors.push({ cat: "concepto", text: L({ es: "Respuesta muy corta para desarrollar el concepto de la pregunta.", en: "Too short to develop the concept asked." }) });
    }
    if (wc >= 25) good.push(L({ es: "Desarrolla la idea con extensión suficiente.", en: "Develops the idea with enough depth." }));
    if (diversity > 0.6) good.push(L({ es: "Vocabulario variado y técnico.", en: "Varied, technical vocabulary." }));
    if (sentences >= 3) good.push(L({ es: "Estructura clara en varias frases.", en: "Clear multi-sentence structure." }));
    if (!errors.length && !good.length) good.push(L({ es: "Respuesta directa al grano.", en: "Gets straight to the point." }));

    return { errors: errors.slice(0, 3), good: good.slice(0, 2) };
  }

  /* ---------------- builtin driver ---------------- */
  function buildPath() {
    const path = [];
    path.push({ kind: "warmup" });
    for (let i = 0; i < 4; i++) path.push({ kind: "main" });
    path.push({ kind: "closing" });
    return path;
  }

  const Agent = {
    mode: "builtin",
    _path: [],
    _visited: new Set(),
    _index: 0,

    reset: function () {
      this._path = buildPath();
      this._visited = new Set();
      this._index = 0;
      this._introDone = false;
    },

    nextQuestion: async function (history) {
      const lang = window.I18N ? window.I18N.getLocale() : "es";
      // "start with the presentation" checkbox: deterministic Q1 from the bank,
      // before any remote call; _index untouched so the warmup step still runs next
      if (!this._introDone) {
        this._introDone = true;
        const intro = window.Questions.introFirstQuestion && window.Questions.introFirstQuestion();
        if (intro) { Agent._visited.add(intro.id); return lang === "en" ? intro.en : intro.es; }
      }
      if (this.mode === "remote") {
        try { return await nextQuestionRemote(history, lang); }
        catch (e) { /* fall through to builtin */ }
      }
      // builtin path selection
      let step = this._path[this._index] || { kind: "main" };
      this._index++;
      if (step.kind === "closing") {
        const c = window.Questions.closing();
        const q = c[Math.floor(Math.random() * c.length)];
        return q ? (lang === "en" ? q.en : q.es) : "";
      }
      if (step.kind === "warmup") {
        const pool = window.Questions.warmup().filter(function (q) { return !Agent._visited.has(q.id); });
        const pick = (pool.length ? pool : window.Questions.warmup())[Math.floor(Math.random() * (pool.length || 1))];
        if (pick) { Agent._visited.add(pick.id); return lang === "en" ? pick.en : pick.es; }
      }
      const pool = window.Questions.all().filter(function (q) { return !Agent._visited.has(q.id); });
      const pick = (pool.length ? pool : window.Questions.all())[Math.floor(Math.random() * (pool.length || 1))];
      if (pick) { Agent._visited.add(pick.id); return lang === "en" ? pick.en : pick.es; }
      return "";
    },

    evaluateAnswer: async function (question, answer) {
      const lang = window.I18N ? window.I18N.getLocale() : "es";
      if (this.mode === "remote") {
        try { return await evaluateRemote(question, answer, lang); } catch (e) {}
      }
      return evaluateBuiltin(answer);
    },

    /* Interviewer's assistant notes for one answer: tagged error bullets +
       good points. Remote asks the LLM; builtin/heuristic fallback keeps the
       demo useful offline and is also the degradation path when remote fails. */
    reviewAnswer: async function (question, answer) {
      const text = String(answer || "").trim();
      if (!text) return null;
      const lang = window.I18N ? window.I18N.getLocale() : "es";
      if (this.mode === "remote") {
        try { return await reviewRemote(question, text, lang); } catch (e) {}
      }
      return reviewBuiltin(text);
    },

    /* Coach: two candidate answers for the current question — one grounded
       STRICTLY in the candidate's CV, one generic model answer. */
    suggestAnswers: async function (question, lang, history) {
      if (this.mode !== "remote") return null;
      const en = lang === "en";
      const sys = COACH_SYSTEM[lang] || COACH_SYSTEM.es;
      // labels + reminders in the OUTPUT language: the Spanish CV otherwise
      // drags the answer language (it dominates the prompt by volume)
      const labels = en
        ? { q: "QUESTION", profile: "CANDIDATE PROFILE (facts only — the profile's language is NOT the answer language)", ctx: "PREVIOUS Q&A (context for references like \"those challenges\")", remind: "Remember: write BOTH answers in ENGLISH." }
        : { q: "PREGUNTA", profile: "PERFIL DEL CANDIDATO (solo datos; el idioma del perfil NO es el idioma de la respuesta)", ctx: "CONVERSACIÓN PREVIA (contexto para referencias como «aquellos retos»)", remind: "Recuerda: escribe las dos respuestas EN CASTELLANO." };
      const corpus = window.VERBATIM_CV || {};
      const cvText = typeof corpus === "string" ? corpus : (corpus[lang] || corpus.es || "(no disponible)");
      const conv = (history || []).slice(-4).map(function (h) {
        return (h.role === "agent" ? "P: " : "R: ") + h.text;
      }).join("\n");
      const raw = await chat({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: labels.q + ": " + question +
            (conv ? "\n\n" + labels.ctx + ":\n" + conv : "") +
            "\n\n" + labels.profile + ":\n" + cvText + "\n\n" + labels.remind }
        ],
        response_format: { type: "json_object" }, max_tokens: 500, temperature: 0.5
      });
      let parsed = null;
      try { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch (e) {}
      if (!parsed || !parsed.cv || !parsed.general) throw new Error("bad coach JSON");
      // mechanical guard: models anchor on "reduced X by 40%" — drop any
      // sentence with a percentage (the CV corpus contains no metrics)
      return { cv: stripPercentSentences(String(parsed.cv).trim()), general: stripPercentSentences(String(parsed.general).trim()) };
    }
  };

  function stripPercentSentences(text) {
    if (!/\d\s*%/.test(text)) return text;
    const kept = text.split(/(?<=[.!?])\s+/).filter(function (s) { return !/\d\s*%/.test(s); });
    return (kept.join(" ") || text).trim();
  }

  /* Switch mode + rebuild path when a new session starts. */
  Agent.startSession = function () {
    this.mode = (window.Config.get()).agent || "builtin";
    this.reset();
  };

  window.Agent = Agent;
})();
