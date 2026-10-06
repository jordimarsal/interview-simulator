# Requirements — offer_mode

> Source: `apply/back_market.md` §7 (ideas to evolve the interview-simulator).
> Goal: prepare **specific** interviews (Back Market, Preply, Yaba, Clarivate,
> Extia) by driving the simulator with each offer's gaps, stages and STAR
> stories instead of the generic bank.

---

## 1. Offer question sets (data)

- **R1.1** (Ubiquitous): The system shall load offer question sets embedded as
  `js/offer-sets.js` (`window.OFFER_SETS`) with zero network requests on `file://`.
- **R1.2** (Event-driven): When the user picks a `.json` set file in the settings
  drawer, the system shall validate, register and activate it for the session
  (choice persisted in `Config` by set `id`).
- **R1.3** (Unwanted): The system shall not fetch remote URLs to obtain offer
  data at runtime.
- **R1.4** (Event-driven): When a set fails validation (missing `id`, `stages`
  without `{es,en}` questions, malformed stories), the system shall reject it
  with a visible toast and keep the previous state — never a silent failure and
  never a broken session.

## 2. Offer mode (gap probing)

- **R2.1** (State-driven): While an offer set is active in *remote* mode, the
  interviewer prompt shall include the set's brief: company, role, gap list
  (topic + probe) and, when a stage is selected, that stage's focus — so the
  LLM asks about the offer's gaps (e.g. Celery, Vue/Nuxt, system design).
- **R2.2** (State-driven): While an offer set is active in *builtin* mode,
  `Questions` shall serve literal questions from the active set (selected
  stage, or all stages when none selected) instead of the default bank.
- **R2.3** (State-driven): While an offer set is active, the Coach
  (`suggestAnswers`) shall receive the offer's gap context so its answers can
  bridge gaps — still grounded strictly in `VERBATIM_CV` and still subject to
  the `%`-strip guard.
- **R2.4** (Event-driven): When the offer is deactivated, the system shall
  restore the default bank, prompts and session length exactly as before.
- **R2.5** (Unwanted): The system shall not block or end a session because the
  active set is exhausted or incomplete (degrade: repeat within the set, then
  fall back to the default bank).

## 3. Stage selector

- **R3.1** (Event-driven): When the active set defines more than one stage, the
  system shall let the user select a stage in the settings drawer; the question
  pool (builtin) and the prompt focus (remote) shall follow that selection.
- **R3.2** (Optional): Where no stage is selected, the system shall use all
  stages of the set and no stage-specific focus.

## 4. STAR drill

- **R4.1** (State-driven): While STAR mode is on and the active set has
  stories, the interviewer shall act as a hiring manager working story by
  story: open the story (situation/task), then demand the candidate's specific
  action, then demand the measurable result — following up when the answer has
  no numbers or concrete outcome.
- **R4.2** (State-driven): While STAR mode is on, the client shall drive the
  story pointer (2 turns per story: opening + action/result probe) so both
  builtin and remote modes share the same deterministic structure.
- **R4.3** (State-driven): While STAR mode is on in *builtin* mode, the system
  shall produce the manager questions from the story data itself (no LLM) so
  the drill works fully offline.
- **R4.4** (Event-driven): When STAR mode is requested without an active set
  (or a set without stories), the system shall show a visible notice and
  continue as a standard interview — never crash, never a silent no-op.
- **R4.5** (State-driven): While STAR mode is on, the session goal shall be
  `stories × 2` answers (capped at the reel's 10 segments) instead of 6;
  «Terminar» still ends and scores the session at any point.

## 5. Copy and contracts

- **R5.1** (Ubiquitous): Every new UI string shall exist in `js/i18n.js` with
  stable key and `es` + `en` entries; offer set questions/stories carry
  `{es,en}` pairs and are asked in the session language.
- **R5.2** (Ubiquitous): The system shall keep every contract in
  `CONTRACTS.md` §3 intact (chat(opts) shape, `%` guard, silent-error ban,
  `file://` first-class, reviewer never blocks the next turn).
- **R5.3** (Event-driven): When no offer set is active, the system shall behave
  exactly as the pre-feature simulator (default bank, default prompts, 6
  answers).
