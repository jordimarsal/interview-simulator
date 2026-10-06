# Verification

This document defines how to prove that work works. Every feature must pass verification
before it can be marked as done. There are no exceptions.

---

## Verification Levels

### Level 1: Unit Tests (Mandatory)

Every feature must have unit tests. Unit tests verify individual functions, methods, and
classes in isolation. They must:

- Cover every public function and method.
- Test both the happy path and every documented error case.
- Be deterministic: running the same test twice must produce the same result.
- Be fast: the full unit test suite must complete in under 60 seconds.

### Level 2: Integration Tests (Mandatory for UI/API)

Any feature that introduces or modifies a user interface endpoint, REST API endpoint,
or inter-service boundary must include integration tests. These tests must:

- Exercise the full request/response cycle from the external interface inward.
- Use realistic inputs, including edge cases and malformed data.
- Verify both correct behavior and correct error responses.
- Run against a test environment that mirrors production configuration as closely as
  possible.

Features that are purely internal (utilities, data transformations, algorithms) do not
require integration tests but still require unit tests.

### Level 3: Smoke Tests (Optional)

Smoke tests are lightweight checks that confirm the system starts and responds to basic
requests. They are optional but recommended for:

- Services that have historically had startup regressions.
- Features that change dependency injection, configuration loading, or initialization
  order.

Smoke tests must not replace unit or integration tests. They are a supplement, not a
substitute.

### Level 4: Requirement Traceability (Mandatory for All Features)

Every requirement R\<n\> in the spec must map to at least one test that verifies it.
This mapping is documented in the progress file (see `specs.md` - Traceability section).
A feature cannot be marked as done until every requirement has a passing test that
proves it works.

---

## Anti-Patterns

The following are explicitly prohibited and will cause a review rejection:

### "It should work" without tests

Claiming that code is correct by visual inspection or informal manual testing is not
acceptable. If there is no automated test, the feature is not done. This applies to
bug fixes as well: every bug fix must include a test that would have caught the bug.

### Tests that only check no-throw

A test whose only assertion is that the code does not throw an exception is not a valid
test. Example of an invalid test:

```python
def test_login():
    result = login("user", "pass")  # no assertion on result
    # test passes if no exception is raised -- INVALID
```

Every test must assert something specific about the output, state change, or returned
value. At minimum, verify the return type and at least one expected property.

### Marking done without harness/init.sh

No feature may be marked as `done` unless `harness/init.sh` completes successfully. This is
the final gate. If `harness/init.sh` fails for any reason, the feature remains `in_progress`.

### Trusting a subagent's "done" claim

A chat reply is not evidence. After **every** implementer batch, verify on disk before
dispatching the next one:

- the batch's tasks are marked `[x]` in `harness/specs/<name>/tasks.md`;
- the files it claims to have created really exist and are not empty shells;
- you run the gates yourself: `uv run ruff check .`, `uv run black --check .`,
  `uv run mypy`, `uv run pytest tests`.

A reply `done … -> <file>` whose file does not exist has actually happened (twice):
re-dispatch the same batch opened with `Nothing was written: <missing paths>. Create
<first file> now.`

### Reading the test count

`pyproject.toml` sets `addopts = "-q"`, so adding your own `-q` yields `-qq`, which
**hides the summary line** — you get only dots and no total. Always run:

```
uv run pytest tests        # last line: "486 passed, 1 warning in 4.09s"
```

and read `N passed`. A row of dots with no `F`/`E` is a pass, not a summary.
`tests/unit/tooling/test_quality_gates.py::test_R1_quality_gates_pass` fails whenever
`ruff` does, so a lint error also surfaces as a failed test.

---

## Security Audit Checklist

Read `"audit_level"` from `harness/feature_list.json` (`basic` → confirm each item
manually and record the confirmation in the review file). This project is a
single-user localhost app with **security explicitly out of scope** (no auth, no
users) — the checklist below is therefore minimal and static-analysis oriented:

- [ ] No secrets, API keys, tokens or credentials committed (search for common key
      patterns; provider configuration lives outside the repo).
- [ ] No authentication/authorization/session code was added (out of scope by
      `docs/architecture.md` — its presence would be a spec deviation, not a feature).
- [ ] The API binds to localhost only; no deployment/hosting configuration was added.
- [ ] SQLite access uses parameterized queries everywhere (no string-built SQL).
- [ ] Scraped/API payloads are parsed into typed values only — never executed,
      never rendered as raw HTML without escaping.
- [ ] No `eval`/`exec`/`pickle` of external input anywhere under `src/` or `web/src`.
- [ ] Dependencies come from the official registries via `uv`/`npm` lockfiles; no
      vendored binaries, no `curl | sh` in scripts.

---

## Final Verification

The last step before any feature transitions to `done` is:

```
harness/init.sh
```

The script must finish with the output:

```
[OK]
```

If the script produces any error output, exits with a non-zero code, or does not print
`[OK]` as its final line, the feature is not done. The implementer must diagnose and
fix the issue before requesting the completion gate review.

This check is not optional. It is not a suggestion. It is the final, non-negotiable
proof that the system is in a working state.
