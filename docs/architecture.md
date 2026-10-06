# Architecture — VERBATIM · Voice Interview Simulator

> Domain contracts and module roles live in `CONTRACTS.md` — this file records the
> architectural *quality bar* and the boundaries that must not move.

---

## Principles

1. **`file://` is a first-class citizen.** No build, no CDN, no frameworks, no ESM.
   Every feature must keep working when `index.html` is double-clicked. `fetch` to
   `localhost` is the only network exception (local LLM/STT/TTS servers).
2. **IIFE modules + globals.** ES5-ish, `"use strict"`, `window.Module` exposure.
   No classes, no bundler output, no transpilation.
3. **Graceful degradation over error paths.** Nothing throws uncaught; every
   remote dependency (LLM, Whisper, Piper) has an offline builtin fallback, and
   STT/TTS errors surface in the UI (never silent empty strings).
4. **One LLM entry point.** All model calls go through `Agent.chat(opts)` — one
   object argument, `messages` always present (a silenced 400 becomes an empty
   bubble; see CONTRACTS.md §3).
5. **Data files are code.** Bilingual corpora (`VERBATIM_CV`, question bank,
   offer sets) ship as plain `.js` assignments so `<script src>` works on
   `file://`. JSON/YAML sources outside the repo are compiled to `.js` by a
   script, never fetched at runtime.

## Data Flow

```
index.html ──> interview.html
                 ├─ js/config.js      (localStorage defaults + drawer)
                 ├─ js/questions.js   (bank + topics filter)
                 ├─ js/offers.js      (offer sets registry: window.OFFER_SETS + user-loaded JSON)
                 ├─ js/agent.js       (builtin heuristic | remote llama-server; chat(opts))
                 ├─ js/speech.js      (TTS Piper/SpeechSynthesis + STT Web Speech/Whisper→WAV)
                 └─ js/app.js         (state machine IDLE→ASKING→RECORDING→THINKING→…)
```

Turn pipeline: `poseQuestion` → user answer → `reviewAnswer` (parallel, never
blocks) + `evaluateAnswer` → `advance()`. Offer mode swaps the question source
and enriches the remote prompts; STAR drill swaps the interviewer persona and
iterates over the offer's stories. Neither may change the turn pipeline.

## Do Not

- Do not add external dependencies of any kind (the only tolerated dev-only
  exception is `jsdom` for the e2e harness, never shipped to the page).
- Do not index `I18N.STRINGS` by language (`STRINGS["nav_start"].es`, never
  `STRINGS["es"]`).
- Do not hardcode user-visible text in HTML — new copy goes to `js/i18n.js`
  with stable keys and both `es` + `en` entries.
- Do not let the Coach invent metrics (`%` is mechanically stripped) or facts
  outside `window.VERBATIM_CV[lang]`.
- Do not block the next turn on the answer reviewer, and never leave a session
  blocked when a question has no valid topic (degrade, repeat, continue).
