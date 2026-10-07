#!/usr/bin/env python3
"""Check requirement traceability for harness specs (Protocol v1).

For each feature with a spec (harness/specs/<name>/requirements.md), collects
the R<n> identifiers, merges the traceability tables from every
harness/progress/impl_*.md, and verifies:
  1. every R<n> appears in at least one table row;
  2. every test identifier referenced by a row exists literally under tests/
     (file name or file content match).

Per Protocol §5, requirements whose table Status is not "done" are reported
as unresolved (they do not create gaps).

Usage:
  check-traceability.py --all [--json] [root]
  check-traceability.py --feature NAME [--json] [root]

Exit codes: 0 covered, 1 gaps, 2 usage error.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REQ_RE = re.compile(r"\bR(\d+)\b")
ROW_RE = re.compile(r"^\|\s*(R\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|")


def find_requirements(root: Path, feature: str) -> set[str]:
    req_file = root / "harness" / "specs" / feature / "requirements.md"
    if not req_file.is_file():
        return set()
    return {f"R{m}" for m in REQ_RE.findall(req_file.read_text(encoding="utf-8"))}


ATTR_RE = re.compile(r"(?im)^\s*feature\s*:\s*([a-z0-9_-]+)\s*$")


def _merge_impl_table(
    text: str,
    impl_name: str,
    feature: str | None,
    merged: dict[str, list[str]],
    statuses: dict[str, str],
) -> None:
    """Fold one impl_*.md file's rows into the merged tables (protocol v1.1)."""
    owner = ATTR_RE.search(text)
    if owner is None:
        if feature is not None:
            statuses.setdefault("__unattributed__", impl_name)
        return
    if feature is not None and owner.group(1) != feature:
        return
    for line in text.splitlines():
        m = ROW_RE.match(line)
        if m is None:
            continue
        req = m.group(1)
        tests = [t for t in re.split(r"[,\s]+", m.group(2).strip()) if t]
        statuses.setdefault(req, m.group(4).strip())
        merged.setdefault(req, [])
        for t in tests:
            if t not in merged[req]:
                merged[req].append(t)


def collect_tables(
    root: Path, feature: str | None = None
) -> tuple[dict[str, list[str]], dict[str, str]]:
    """Merge only those impl_*.md tables attributed to `feature` (protocol v1.1)."""
    merged: dict[str, list[str]] = {}
    statuses: dict[str, str] = {}
    progress = root / "harness" / "progress"
    if not progress.is_dir():
        return merged, statuses
    for impl in sorted(progress.glob("impl_*.md")):
        _merge_impl_table(
            impl.read_text(encoding="utf-8"), impl.name, feature, merged, statuses
        )
    return merged, statuses


def _node_id_exists(root: Path, identifier: str) -> bool:
    """Exact node id `path/to/test_file.py::test_name` — verify both halves."""
    import ast

    rel, _, name = identifier.rpartition("::")
    tf = root / rel
    if not tf.is_file():
        return False
    try:
        tree = ast.parse(tf.read_text(encoding="utf-8", errors="replace"))
    except SyntaxError:
        return False
    return any(
        isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        and node.name == name
        for node in ast.walk(tree)
    )


def _search_tests_dir(root: Path, identifier: str) -> bool:
    """File-name stem or any test function/class named `identifier` under tests/."""
    import ast

    tests_dir = root / "tests"
    if not tests_dir.is_dir():
        return False
    for tf in tests_dir.rglob("*.py"):
        if tf.stem == identifier:
            return True
        try:
            tree = ast.parse(tf.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if (
                isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                and node.name == identifier
            ):
                return True
    return False


def test_identifier_exists(root: Path, identifier: str) -> bool:
    ident = identifier.strip()
    if "::" in ident:
        return _node_id_exists(root, ident)
    return _search_tests_dir(root, ident)


def check_feature(root: Path, feature: str) -> dict:
    requirements = find_requirements(root, feature)
    tables, statuses = collect_tables(root, feature)
    gaps: list[dict[str, str]] = []
    covered = 0
    for req in sorted(requirements, key=lambda r: int(r[1:])):
        tests = tables.get(req)
        if not tests:
            gaps.append(
                {
                    "requirement": req,
                    "reason": "not present in any impl traceability table",
                }
            )
            continue
        missing = [t for t in tests if not test_identifier_exists(root, t)]
        if missing:
            gaps.append(
                {
                    "requirement": req,
                    "reason": f"test identifier(s) not found under tests/: {', '.join(missing)}",
                }
            )
            continue
        covered += 1
    # protocol §5: unresolved = requirements whose table Status is not "done"
    unresolved = [
        req
        for req in sorted(requirements, key=lambda r: int(r[1:]))
        if req in statuses and statuses[req] != "done"
    ]
    return {
        "name": feature,
        "requirements": len(requirements),
        "covered": covered,
        "gaps": gaps,
        "unresolved": unresolved,
    }


class UsageError(Exception):
    """Raised for malformed CLI usage; main prints it and exits 2."""


KNOWN_FLAGS = ("--json", "--all", "--feature", "--root")


def _take_value(flag: str, remaining: list[str]) -> str | None:
    """Remove `flag` and its (required) value from remaining; None if absent."""
    if flag not in remaining:
        return None
    i = remaining.index(flag)
    if i + 1 >= len(remaining):
        raise UsageError(f"{flag} requires a value")
    value = remaining[i + 1]
    del remaining[i : i + 2]
    return value


def parse_args(argv: list[str]) -> "tuple[bool, bool, str | None, Path] | int":
    """Parse CLI flags; return (as_json, all_features, feature, root) or exit code 2."""
    try:
        as_json = "--json" in argv
        all_features = "--all" in argv
        remaining = list(argv)
        feature = _take_value("--feature", remaining)
        root_arg = _take_value("--root", remaining)
        unknown = [a for a in remaining if a.startswith("-") and a not in KNOWN_FLAGS]
        if unknown:
            raise UsageError(f"unknown argument: {unknown[0]}")
        positional = [a for a in remaining if not a.startswith("-")]
        root = Path(root_arg or (positional[-1] if positional else Path.cwd()))
        if not all_features and feature is None:
            raise UsageError(
                "usage: check-traceability.py --all | --feature NAME [--json] [root]"
            )
    except UsageError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return as_json, all_features, feature, root


def _done_features(root: Path) -> set[str]:
    """Names of features whose status in feature_list.json is `done`."""
    flist = root / "harness" / "feature_list.json"
    if not flist.is_file():
        return set()
    try:
        data = json.loads(flist.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return set()
    return {
        f["name"]
        for f in data.get("features", [])
        if isinstance(f, dict) and f.get("status") == "done"
    }


def _selected_features(root: Path, all_features: bool, feature: str | None) -> list[str]:
    if not all_features:
        return [feature]
    specs_dir = root / "harness" / "specs"
    names = sorted(p.name for p in specs_dir.iterdir() if p.is_dir()) if specs_dir.is_dir() else []
    # Only `done` features are gated: a spec_ready/in_progress feature has no
    # implementation table yet, which is not a traceability gap.
    done = _done_features(root)
    return [n for n in names if n in done]


def main(argv: list[str]) -> int:
    parsed = parse_args(argv)
    if isinstance(parsed, int):
        return parsed
    as_json, all_features, feature, root = parsed

    results = [check_feature(root, n) for n in _selected_features(root, all_features, feature)]
    verdict = "PASS" if all(r["gaps"] == [] for r in results) else "FAIL"

    if as_json:
        print(
            json.dumps(
                {
                    "tool": "check-traceability",
                    "protocol": 1,
                    "verdict": verdict,
                    "features": results,
                }
            )
        )
    else:
        for r in results:
            print(f"## {r['name']}: {r['covered']}/{r['requirements']} requirements covered")
            for g in r["gaps"]:
                print(f"  [GAP] {g['requirement']}: {g['reason']}")
        print(f"VERDICT: {verdict}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
