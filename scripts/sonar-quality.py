#!/usr/bin/env python3
"""Render the SonarQube scan report into the published quality assets.

Reads the report produced by the homelab scanner (default: ../harness-report.json
relative to the repo root, the path `analyze.sh -r` writes to) and regenerates:

  docs/quality/index.html       self-contained quality page (GitHub Pages)
  docs/quality/interview-report.json  the raw report, published for inspection
  docs/images/badge-*.svg       static README badges

Static output is deliberate: the Sonar server lives on a LAN-only domain, so
dynamic badges would be unreachable for anyone browsing the repo. Re-run this
script after every scan and commit the result. Stdlib only.

Deliberately no coverage metric: this repo's runtime suites are bash e2e
install/security tests (not measurable by Sonar), and its Python tools are
verified against the frozen eval fixtures.
"""

from __future__ import annotations

import html
import json
import shutil
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REPORT = REPO_ROOT.parent / "interview-report.json"

BRIGHT_GREEN, ORANGE, RED = "#4c1", "#fe7d37", "#e05d44"


def badge(label: str, value: str, color: str) -> str:
    label_w = round(len(label) * 6.6) + 12
    value_w = round(len(value) * 6.6) + 12
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{label_w + value_w}" height="20" role="img" aria-label="{html.escape(f"{label}: {value}")}">
  <title>{html.escape(label)}: {html.escape(value)}</title>
  <defs>
    <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
    <clipPath id="r"><rect width="{label_w + value_w}" height="20" rx="3" fill="#fff"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="{label_w}" height="20" fill="#555"/>
    <rect x="{label_w}" width="{value_w}" height="20" fill="{color}"/>
    <rect width="{label_w + value_w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="{label_w / 2:.0f}" y="14">{html.escape(label)}</text>
    <text x="{label_w + value_w / 2:.0f}" y="14">{html.escape(value)}</text>
  </g>
</svg>
"""


def rating_letter(value: Any) -> str:
    if not isinstance(value, (int, float)):
        return "?"
    return {1: "A", 2: "B", 3: "C", 4: "D", 5: "E"}[max(1, min(5, round(value)))]


def render_page(report: dict[str, Any]) -> str:
    m = report["measures"]
    gate = report["qualityGate"]
    gate_ok = gate.get("status") == "OK"
    cards = [
        ("issues", str(m.get("violations", "?"))),
        ("security hotspots", str(m.get("security_hotspots", "?"))),
        ("lines of code", str(m.get("ncloc", "?"))),
        ("files", str(m.get("files", "?"))),
    ]
    ratings = [
        ("reliability", rating_letter(m.get("reliability_rating"))),
        ("security", rating_letter(m.get("security_rating"))),
        ("maintainability", rating_letter(m.get("sqale_rating"))),
    ]
    card_html = "\n      ".join(
        f'<div class="card"><span class="value">{html.escape(v)}</span><span class="label">{label}</span></div>'
        for label, v in cards
    )
    rating_html = "\n      ".join(
        f'<div class="card"><span class="value">{letter}</span><span class="label">{name}</span></div>'
        for name, letter in ratings
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>interview-simulator — quality</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{
    margin: 0; min-height: 100vh; padding: 2rem;
    background: #05070a; color: #e6edf3;
    font: 14px/1.6 ui-monospace, "JetBrains Mono", Menlo, monospace;
    max-width: 880px; margin-inline: auto;
  }}
  h1 {{ font-size: 1rem; letter-spacing: .2em; text-transform: uppercase; color: #8b98ab; }}
  h2 {{ font-size: .8rem; letter-spacing: .15em; text-transform: uppercase; color: #8b98ab; margin: 2rem 0 .75rem; }}
  .gate {{ display: inline-block; padding: .5rem .9rem; border: 1px solid {'#3ddc97' if gate_ok else '#e05d44'}; border-radius: 8px; background: #0a0e14; }}
  .gate b {{ color: {'#3ddc97' if gate_ok else '#e05d44'}; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: .75rem; }}
  .card {{ display: grid; gap: .2rem; padding: .9rem; border: 1px solid #1c2530; border-radius: 8px; background: #0a0e14; }}
  .value {{ font-size: 1.4rem; color: #3ddc97; }}
  .label {{ font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; color: #8b98ab; }}
  a {{ color: #3ddc97; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  a.back {{ display: inline-block; margin-top: 2rem; padding: .5rem .9rem; border: 1px solid #1c2530; border-radius: 8px; background: #0a0e14; }}
  pre {{ background: #0a0e14; border: 1px solid #1c2530; border-radius: 8px; padding: .9rem; overflow-x: auto; }}
  code {{ color: #8b98ab; }}
  small {{ color: #4d5a6d; }}
</style>
</head>
<body>
  <h1>interview-simulator — quality</h1>
  <p class="gate">quality gate <b>{html.escape(gate.get("name", ""))}</b> · {"passing" if gate_ok else "failing"}</p>

  <h2>Overall (SonarQube)</h2>
  <div class="grid">
      {card_html}
  </div>

  <h2>Ratings</h2>
  <div class="grid">
      {rating_html}
  </div>

  <h2>Why there is no coverage number</h2>
  <p>This is a dependency-free <code>file://</code> static app: its verification
  gates are <code>npm test</code> (JS syntax via <code>node --check</code>, shell
  syntax, and JSON validation of the offer sets) plus ShellCheck on every script,
  wired into CI. There is no unit-test suite to measure coverage against, so no
  coverage number is published — the alternative would be a metric pretending
  those gates do not exist.</p>

  <h2>Raw data</h2>
  <p>The full scan report is published as <a href="interview-report.json">interview-report.json</a>.</p>
  <pre>~/homelab/sonarqube/analyze.sh -r interview-report.json interview-simulator
python3 scripts/sonar-quality.py</pre>

  <a class="back" href="https://github.com/jordimarsal/interview-simulator/blob/main/README.md">README</a>
  <p><small>Rendered from the scan of {html.escape(report["generatedAt"])} by the internal SonarQube
  (LAN-only dashboard). Page, badges and JSON are regenerated after each scan.</small></p>
</body>
</html>
"""


def write_badges(out_dir: Path, report: dict[str, Any]) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    m = report["measures"]
    gate_ok = report["qualityGate"].get("status") == "OK"
    specs = {
        "quality-gate": ("quality gate", "passing" if gate_ok else "failing", BRIGHT_GREEN if gate_ok else RED),
        "code-smells": ("code smells", str(m.get("code_smells", "n/a")), BRIGHT_GREEN if m.get("code_smells") == 0 else ORANGE),
    }
    written = []
    for name, (label, value, color) in specs.items():
        path = out_dir / f"badge-{name}.svg"
        path.write_text(badge(label, value, color))
        written.append(path)
    return written


def main() -> int:
    report_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_REPORT
    if not report_path.exists():
        print(f"report not found: {report_path} (run the scanner first)", file=sys.stderr)
        return 1
    report = json.loads(report_path.read_text())

    quality_dir = REPO_ROOT / "docs/quality"
    quality_dir.mkdir(parents=True, exist_ok=True)
    (quality_dir / "index.html").write_text(render_page(report))
    shutil.copy(report_path, quality_dir / "interview-report.json")

    for path in write_badges(REPO_ROOT / "docs/images", report):
        print(f"  {path.relative_to(REPO_ROOT)}")
    print("  docs/quality/index.html")
    print("  docs/quality/interview-report.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
