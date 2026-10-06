# Design — offer_mode

> Reads: `CONTRACTS.md` (invariants), `docs/architecture.md` (boundaries).
> New data shape, one new module, surgical touches to `questions.js`,
> `agent.js`, `app.js`, `config.js`, `i18n.js`, `interview.html`.

---

## 1. Data: set schema and pipeline

Source of truth: `../../apply/sets/<empresa>.json` (outside the repo, next to
the `.md` dossiers). Schema (all human-facing text as `{es,en}`):

```json
{
  "id": "back_market",
  "company": "Back Market",
  "role":  { "es": "...", "en": "..." },
  "brief": { "es": "2-3 frases de context per al LLM", "en": "..." },
  "gaps": [
    { "topic": "Celery", "probe": { "es": "què preguntar", "en": "what to probe" } }
  ],
  "stages": [
    { "id": "hr_screen",
      "label": { "es": "HR screen (45')", "en": "HR screen (45')" },
      "focus": { "es": "on posar l'èmfasi", "en": "where to push" },
      "questions": [ { "es": "...", "en": "..." } ] }
  ],
  "stories": [
    { "id": "monolith-to-services",
      "label": { "es": "...", "en": "..." },
      "situation": { "es": "...", "en": "..." },
      "task":      { "es": "...", "en": "..." },
      "action":    { "es": "...", "en": "..." },
      "result":    { "es": "...", "en": "..." } }
  ]
}
```

- `result` fields carry **real** figures only (90 adapters, 39 APIs, recall@5
  0.409…). The Coach `%`-guard is untouched — it applies to generated coach
  text, never to the user's own prep data.
- Pipeline: `scripts/build-offer-sets.py` reads `../../apply/sets/*.json` →
  emits `js/offer-sets.js` = `window.OFFER_SETS = {…}` (plain assignment so a
  `<script src>` tag loads it on `file://`; a raw `.json` is NOT valid as JS
  statement). The script runs offline (python3 stdlib only), is idempotent, and
  is what `npm test`-adjacent Gate 3 validates.
- Second ingestion path: settings-drawer `<input type="file" accept=".json">`
  (same pattern as `folder-context.js`) → `Offers.registerSet(obj, name)` —
  for sets edited on the fly without rebuilding.

## 2. Module: `js/offers.js` (new)

IIFE → `window.Offers`. State: `sets` (registry), `activeId`, `stageId`,
`star`, `starPtr` `{story, turn}`.

```js
Offers.list()                      // [{id, company, role}]
Offers.registerSet(obj, srcName)   // validate (§4) + add; returns id or throws {message}
Offers.setActive(id|null)          // null = off; syncs Questions pool; dispatches "offer-changed"
Offers.active()                    // active set object or null
Offers.setStage(stageId|"")        // "" = all stages; re-syncs pool
Offers.stage()                     // stage object or null
Offers.setStar(on)                 // on=true requires active set with stories → boolean ok
Offers.isStar()
Offers.storyTurn()                 // {story, turn, total} | null  (turn ∈ {1,2})
Offers.advanceStarTurn()           // client-driven pointer (R4.2)
Offers.poolForStage()              // [{es,en}] merged questions (stage or all)
Offers.contextForPrompt(lang)      // string block for agent.js (brief+gaps+stage focus)
Offers.storyForPrompt(lang)        // STAR block: persona + current story + turn instruction
Offers.applyConfig(cfg)            // restore offerId/stageId/star from Config at init
```

Events: `document` event `"offer-changed"` after every state change → app.js
refreshes drawer selects + topics panel; agent reads state at call time (no
stale copies).

## 3. Touch points

### `js/questions.js` — offer pool override
- New: `setOfferPool(pool, labels)` / `clearOfferPool()` (module-local
  `offerPool`, `offerLabels`).
- `pick()`/`warmup()`: when `offerPool` is set, draw **only** from it (skip
  `inScope`/TOPIC_OF — offer questions have no builtin topic id; guard the
  existing `inScope` against unknown ids).
- `topicLabels(lang)`: returns `offerLabels` when the pool is active (feeds the
  remote "TEMAS PERMITIDOS" line with the stage/gap labels).
- Exhausted pool → repeat within pool → **never** fall through silently to the
  builtin bank while an offer is active (R2.5 degraded but coherent).

### `js/agent.js` — prompts only, `chat(opts)` untouched
- `nextQuestionRemote`: after the TEMAS line, append
  `Offers.contextForPrompt(lang)`; when `Offers.isStar()`, swap the system
  persona for `Offers.storyForPrompt(lang)` (manager + current story + "exactly
  2 turns for this story").
- STAR builtin path (before the bank path): `Offers.storyTurn()` → canned
  bilingual manager lines — turn 1 opens the story ("Explain the context and
  what you had to achieve…"), turn 2 probes ("What exactly did you do, and
  what was the measurable result?") — then `advanceStarTurn()`.
- `suggestAnswers`: add one line of offer context (company, role, gap topics)
  to the user message. Coach system, `%`-strip and VERBATIM_CV grounding stay
  byte-identical.
- `evaluateAnswer` / `reviewAnswer`: unchanged.

### `js/app.js` — drawer + session goal
- Drawer field "Oferta" (settings, next to folder context): `<select
  id="cfg-offer">`, `<select id="cfg-stage">`, `<label><input type="checkbox"
  id="cfg-star"></label>`, `<input type="file" id="cfg-offer-file"
  accept=".json">` + status line. Populated/read in
  `loadSettingsIntoDrawer()`; persisted in the inline `save` as
  `offerId/stageId/starMode` (app.js owns the live drawer path — CONTRACTS.md
  §3).
- `sessionGoal()` = `Offers.isStar() && Offers.active() ? min(stories×2, 10) : 6`;
  used by `advance()` and `updateReel()` (reel already renders 10 segments).
- Topics panel: when an offer is active, checkboxes disable and a hint line
  shows `offer_active_topics` ("Oferta activa: {name}"); on deactivate,
  restore.
- After each STAR answer, `afterAnswer` calls `Offers.advanceStarTurn()` before
  `advance()`.

### `js/config.js` — three defaults
`offerId: ""`, `stageId: ""`, `starMode: false` added to `DEFAULTS`. No drawer
wiring here (dead path per CONTRACTS.md §3 — app.js owns it).

### `interview.html` — script tags + drawer markup
`js/offer-sets.js` (data) before `js/questions.js`; `js/offers.js` right after
`js/questions.js`; drawer field block as above.

### `js/i18n.js` — new keys (es+en)
`s_offer_label`, `s_offer_hint`, `s_offer_stage`, `s_offer_star`,
`s_offer_star_hint`, `s_offer_file`, `s_offer_loaded` ({name}),
`s_offer_invalid`, `s_offer_star_needs_set`, `offer_active_topics` ({name}),
`star_on`, `star_off`, `star_turn_open`/`star_turn_probe` (builtin manager
lines live in offers.js data, not i18n — they are question content, bilingual
by construction).

## 4. Validation (R1.4)

`Offers.registerSet` checks: `id` (non-empty string), `company`,
`stages` (array ≥1, each with `id`, `label.es/en`, ≥1 question with `es`+`en`
non-empty), `stories` (optional array; each item needs `id`, `label.es/en`,
`situation/task/action/result.es/en`), unknown fields ignored. Failure →
`Error` with a reason → drawer catches → toast `s_offer_invalid` + console
detail. `setActive` re-validates stage id and degrades to `""` (all stages).

## 5. Risks / mitigations

| Risk | Mitigation |
|---|---|
| Offer pool breaks builtin topic logic | Pool bypasses `TOPIC_OF`; `inScope` guarded for unknown ids (unit check) |
| STAR + practice mode interaction | STAR only alters question *source* and persona; practice-mode turn flow untouched (question dictation still works) |
| Remote model ignores story turn discipline | Client owns the pointer and the per-turn instruction; worst case the question text drifts, the structure holds |
| `--update` regenerates AGENTS.md | Contracts live in `CONTRACTS.md`; map points to it as mandatory step 1 |
| Reel shows 10 but goal was 6 | `sessionGoal()` feeds both `advance()` and `updateReel()`; STAR cap = 10 fits the existing reel |

## 6. Out of scope

- No changes to STT/TTS, orb, notes export (`ENTREVISTA_{date}.md` keeps
  working as-is), landing page, or the servers in `scripts/`.
- No YAML parsing in the browser (JSON only — zero dependencies).
- Auto-sync from `apply/<empresa>.md` prose stays manual: the `.md` is the
  dossier, `apply/sets/*.json` the distilled drill data.
