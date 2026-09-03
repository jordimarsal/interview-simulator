/* =========================================================================
   VERBATIM · Question bank
   Bilingual set distilled from Jordi Marçal's CVs and the prepared Q&A in
   docs/. The built-in interviewer draws from here; the remote LLM uses it
   as context. Each entry carries category tags so paths can be varied.
   ========================================================================= */
(function () {
  "use strict";

  const BANK = [
    { id: "intro", cat: ["warmup"],
      es: "Para empezar, ¿podrías contarme un poco sobre ti y tu trayectoria como desarrollador?",
      en: "To start, could you tell me a little about yourself and your background as a developer?" },

    { id: "selfnode", cat: ["warmup", "languages"],
      es: "¿Cuáles son tus tecnologías principales y por qué Java es tu casa dentro del backend?",
      en: "What are your core technologies, and why is Java your home within backend?" },

    { id: "modernize", cat: ["experience", "node"],
      es: "Modernizaste 39 APIs con Node.js: ¿cuál fue el mayor reto?",
      en: "You modernized 39 APIs with Node.js — what was the biggest challenge?" },

    { id: "datamaster", cat: ["data", "softskills"],
      es: "¿Cómo te ha ayudado tu Máster en Ciencia de Datos como ingeniero de backend?",
      en: "How has your Master's in Data Science helped you as a backend engineer?" },

    { id: "restapi", cat: ["spring", "architecture"],
      es: "¿Cómo sueles diseñar una API REST en Spring Boot desde cero?",
      en: "How do you usually design a REST API in Spring Boot from scratch?" },

    { id: "exceptions", cat: ["spring", "engineering"],
      es: "¿Cómo manejas las excepciones y el manejo de errores en una API de Spring Boot?",
      en: "How do you handle exceptions and error handling in a Spring Boot API?" },

    { id: "component", cat: ["spring", "concepts"],
      es: "¿Cuál es la diferencia real entre @Component, @Service y @Repository en Spring Boot?",
      en: "What's the real difference between @Component, @Service and @Repository in Spring Boot?" },

    { id: "dockercat", cat: ["devops", "cicd"],
      es: "¿Puedes explicar cómo trabajaste con Docker, Kubernetes y pipelines de CI/CD?",
      en: "Can you explain how you worked with Docker, Kubernetes and CI/CD pipelines?" },

    { id: "messaging", cat: ["async", "infra"],
      es: "¿Has trabajado con sistemas de comunicación asíncrona como Kafka o RabbitMQ? ¿Tu experiencia?",
      en: "Have you worked with asynchronous systems like Kafka or RabbitMQ? What was your experience?" },

    { id: "sqlslow", cat: ["performance", "database"],
      es: "¿Qué haces cuando ves una consulta SQL demasiado lenta en producción?",
      en: "What do you do when you see a query that's too slow in production?" },

    { id: "cap", cat: ["theory", "distributed"],
      es: "Explica el teorema CAP y dónde se aplica en la práctica.",
      en: "Explain the CAP theorem and where it applies in practice." },

    { id: "leak", cat: ["debugging", "java"],
      es: "Cuéntame cómo depurarías una fuga de memoria en Java paso a paso.",
      en: "Walk me through how you'd debug a memory leak in Java step by step." },

    { id: "pushback", cat: ["softskills", "conflict"],
      es: "Cuéntame una ocasión en la que no estuviste de acuerdo con un tech lead o un product manager.",
      en: "Tell me about a time you disagreed with a tech lead or product manager." },

    { id: "debt", cat: ["softskills", "engineering"],
      es: "Cómo manejas la deuda técnica en tu día a día?",
      en: "How do you handle technical debt day to day?" },

    { id: "years", cat: ["career", "behavioral"],
      es: "¿Por qué estuviste varios años en la misma empresa? Cuéntame tu trayectoria.",
      en: "Why did you stay at the same company for several years? Tell me about your path." },

    { id: "future", cat: ["career", "aspirations"],
      es: "¿Dónde te ves dentro de 2 años?",
      en: "Where do you see yourself in two years?" },

    { id: "learning", cat: ["growth", "habits"],
      es: "Cómo te mantenes al día con las últimas tecnologías y tendencias del sector?",
      en: "How do you stay up to date with the latest technologies and trends?" },

    { id: "concurrency", cat: ["java", "debugging"],
      es: "Cuéntame una ocasión en la que resolviste un problema de concurrencia o un incidente en producción.",
      en: "Tell me about a time you resolved a concurrency issue or a production incident." }
  ];

  const CLOSING = [
    { es: "Ahora eres tú quien pregunta: ¿tienes alguna pregunta sobre el equipo o la arquitectura?",
      en: "Now it's your turn: do you have any questions about the team or the architecture?" },
    { es: "¿Hay algo más que quieras añadir o que no hayamos tocado?",
      en: "Is there anything else you'd like to add that we haven't covered?" }
  ];

  function all() { return BANK.slice(); }
  function warmup() { return BANK.filter(function (q) { return q.cat.indexOf("warmup") >= 0; }); }
  function pick(excludeSet) {
    let pool = BANK.filter(function (q) {
      if (!excludeSet.has(q.id)) return true;
      return false;
    });
    if (!pool.length) pool = BANK.slice();
    // deterministic-ish shuffle seeded by time so paths vary but stay stable per load
    const seed = Math.floor(Date.now() / 60000);
    pool.sort(function () { return 0.5 - ((seed * 9301 + 49297) % 233280) / 233280; });
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function closing() { return CLOSING.slice(); }

  window.Questions = { all: all, warmup: warmup, pick: pick, closing: closing };
})();
