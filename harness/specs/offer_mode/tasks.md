# Tasks — offer_mode

> Batches of 2–4 consecutive tasks. Gates after every batch:
> `bash scripts/check.sh` (syntax + set JSON), plus the task's own check.

- [x] **T1 — Set builder** (`scripts/build-offer-sets.py`)
  Reads `../../apply/sets/*.json`, validates each against the §1 schema
  (fail loudly with file+reason), emits `js/offer-sets.js`
  (`window.OFFER_SETS = {id: set}`), sorted by id, with a generated-by header.
  Idempotent. *Check: run it on the exemplar set; `node --check js/offer-sets.js`;
  re-run → identical output.*

- [x] **T2 — Exemplar set** (`../../apply/sets/back_market.json`)
  Full §5 distillation of `apply/back_market.md`: stages hr_screen, coding_test,
  system_design, data_module, tech_leadership, values; gaps (Celery,
  PostgreSQL, system design, Vue/Nuxt); 5 stories from §4 with real figures.
  Bilingual es/en. *Check: T1 accepts it; JSON parses (Gate 3).*

- [x] **T3 — `js/offers.js`**
  Registry + validation + state machine per design §2 (`list`, `registerSet`,
  `setActive`, `setStage`, `setStar`, `storyTurn`, `advanceStarTurn`,
  `poolForStage`, `contextForPrompt`, `storyForPrompt`, `applyConfig`), events,
  no DOM access except `document.dispatchEvent` (keeps it unit-testable in
  Node with a `window` stub).

- [x] **T4 — `js/questions.js` offer pool**
  `setOfferPool/clearOfferPool`, `pick/warmup` serve the pool exclusively,
  `topicLabels` returns pool labels, `inScope` guarded for pool ids, pool
  exhaustion repeats within the pool. *Check: node harness — with pool set,
  30 picks all come from the pool; without, byte-identical old behavior.*

- [x] **T5 — `js/agent.js` offer/STAR integration**
  Remote: `contextForPrompt` into `nextQuestionRemote`; STAR persona +
  story block; coach gap line. Builtin: STAR story driver before the bank
  path. `chat(opts)`, `%`-guard, reviewer untouched. *Check: node harness —
  stub fetch, assert offer block present in body.messages when active and
  absent when not; builtin STAR returns opening then probe per story.*

- [x] **T6 — Drawer + session wiring** (`app.js`, `config.js`, `interview.html`)
  Offer/stage/star/file inputs, config persistence, `sessionGoal()`,
  topics-panel hint, `advanceStarTurn()` in `afterAnswer`, script tags and
  drawer markup. *Check: node --check; manual probe list below.*

- [x] **T7 — i18n keys** (all of design §3's list, `es` + `en`)
  *Check: cross-ref — every `T("s_offer_*")`/`offer_*` reference in code has a
  key in both locales; no key left unused.*

- [x] **T8 — Remaining sets** (`../../apply/sets/{yaba,preply,clarivate,extia}.json`)
  Same schema; gaps from each dossier's flancs (NetSuite/EDI vocabulary,
  Django/A-B, LLM-years/Azure/lead-influence, fine-tuning/React/English);
  stories from each dossier's strong material. *Check: T1 accepts all four.*

- [x] **T9 — e2e + non-regression**
  Recreate `/tmp/opencode/e2e-interview.js` (canvas/matchMedia/localStorage
  stubs per CONTRACTS.md §5): default session still 6 answers and no console
  errors; with `back_market` active + STAR, session goal = 10, questions come
  from the set. Update `CONTRACTS.md` (§2 adds `js/offers.js` +
  `js/offer-sets.js`; §5 adds builder command). *Check: e2e green in both
  modes; `npm test` green.*

## Batches

| Batch | Tasks | Coherent unit |
|---|---|---|
| B1 | T1, T2 | data pipeline + exemplar |
| B2 | T3, T4 | question source layer |
| B3 | T5 | brain (prompts + STAR driver) |
| B4 | T6, T7 | UI + copy |
| B5 | T8, T9 | content + verification |

## Manual probe (Completion Gate)

1. `file://` double-click `index.html` → interview: default flow unchanged.
2. Drawer → Oferta `back_market`, stage `system_design` → questions come from
   that stage (builtin, no LLM running).
3. With the LLM up (`bash scripts/run-agent.sh`): agent probes gaps in its own
   words; Coach bridges without inventing metrics.
4. STAR on → 10-segment reel, story opening then metric probe, «Terminar»
   scores early without errors.
5. Language switch mid-drawer: every new label swaps es/en.
