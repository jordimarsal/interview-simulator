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
    es: "Eres el coach del candidato durante una entrevista técnica. Escribe SIEMPRE EN CASTELLANO, aunque el perfil esté en otro idioma. Devuelve ÚNICAMENTE un objeto JSON válido (sin código, sin markdown) con este esquema exacto: {\"cv\": \"...\", \"general\": \"...\"}. \"cv\": una respuesta posible a la pregunta basada ESTRICTAMENTE en el PERFIL DEL CANDIDATO que te doy — usa solo experiencia, logros y tecnologías que aparezcan ahí; nada inventado. \"general\": una respuesta modelo alternativa, sólida pero sin datos personales. Cada respuesta en 2-4 frases, primera persona, tono natural de entrevista.",
    en: "You are the candidate's coach during a technical interview. ALWAYS WRITE IN ENGLISH, even if the profile is in another language. Return ONLY a valid JSON object (no code fences, no prose) with this exact schema: {\"cv\": \"...\", \"general\": \"...\"}. \"cv\": one possible answer to the question based STRICTLY on the CANDIDATE PROFILE provided — use only experience, achievements and technologies present there; nothing invented. \"general\": an alternative model answer, strong but without personal data. Each answer 2-4 sentences, first person, natural interview tone."
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
    const prompt = sys + "\n\nTEMAS PERMITIDOS (alterna entre temas técnicos y no técnicos, sin repetirlos): " +
      (window.Questions.topicLabels(lang).join(", ") || "libre") +
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
  function strip(s) { return (s || "").replace(/^["'\s\u201C\u201E]+|["'\s\u201D\u2019]+$/g, "").trim(); }

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
    },

    nextQuestion: async function (history) {
      const lang = window.I18N ? window.I18N.getLocale() : "es";
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

    /* Coach: two candidate answers for the current question — one grounded
       STRICTLY in the candidate's CV, one generic model answer. */
    suggestAnswers: async function (question, lang) {
      if (this.mode !== "remote") return null;
      const en = lang === "en";
      const sys = COACH_SYSTEM[lang] || COACH_SYSTEM.es;
      // labels + reminders in the OUTPUT language: the Spanish CV otherwise
      // drags the answer language (it dominates the prompt by volume)
      const labels = en
        ? { q: "QUESTION", profile: "CANDIDATE PROFILE (facts only — the profile's language is NOT the answer language)", remind: "Remember: write BOTH answers in ENGLISH." }
        : { q: "PREGUNTA", profile: "PERFIL DEL CANDIDATO (solo datos; el idioma del perfil NO es el idioma de la respuesta)", remind: "Recuerda: escribe las dos respuestas EN CASTELLANO." };
      const corpus = window.VERBATIM_CV || {};
      const cvText = typeof corpus === "string" ? corpus : (corpus[lang] || corpus.es || "(no disponible)");
      const raw = await chat({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: labels.q + ": " + question + "\n\n" + labels.profile + ":\n" + cvText + "\n\n" + labels.remind }
        ],
        response_format: { type: "json_object" }, max_tokens: 500, temperature: 0.7
      });
      let parsed = null;
      try { const m = raw.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch (e) {}
      if (!parsed || !parsed.cv || !parsed.general) throw new Error("bad coach JSON");
      return { cv: String(parsed.cv).trim(), general: String(parsed.general).trim() };
    }
  };

  /* Switch mode + rebuild path when a new session starts. */
  Agent.startSession = function () {
    this.mode = (window.Config.get()).agent || "builtin";
    this.reset();
  };

  window.Agent = Agent;
})();
