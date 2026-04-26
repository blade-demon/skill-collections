#!/usr/bin/env python3
"""Regression tests for explicit traceability anchors in generated output."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent
SAMPLE_DIR = SKILL_DIR / "examples" / "today-windvane"


class TraceabilityTest(unittest.TestCase):
    def generate_sample(self, out_dir: Path) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(SKILL_DIR / "scripts" / "generate-output.py"),
                "--ui",
                str(SAMPLE_DIR / "contracts" / "ui-schema.yaml"),
                "--api",
                str(SAMPLE_DIR / "contracts" / "api-schema.yaml"),
                "--mapping",
                str(SAMPLE_DIR / "contracts" / "mapping-logic.yaml"),
                "--out-dir",
                str(out_dir),
            ],
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

    def validate_output(self, out_dir: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(SKILL_DIR / "scripts" / "validate-output.py"),
                "--strict",
                "--ui",
                str(out_dir / "contracts" / "ui-schema.yaml"),
                "--api",
                str(out_dir / "contracts" / "api-schema.yaml"),
                "--mapping",
                str(out_dir / "contracts" / "mapping-logic.yaml"),
                "--notes",
                str(out_dir / "notes.md"),
                "--data-fetching",
                str(out_dir / "data-fetching.md"),
                "--spec",
                str(out_dir / "specs" / "today-windvane" / "spec.md"),
            ],
            text=True,
            capture_output=True,
        )

    def test_generated_output_contains_machine_trace_anchors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_dir = Path(tmp_dir) / "today-windvane"
            self.generate_sample(out_dir)

            notes = (out_dir / "notes.md").read_text(encoding="utf-8")
            data_fetching = (out_dir / "data-fetching.md").read_text(encoding="utf-8")
            spec = (out_dir / "specs" / "today-windvane" / "spec.md").read_text(encoding="utf-8")

            self.assertIn("## Traceability", notes)
            self.assertIn("`component:cardContainer`", notes)
            self.assertIn("`binding:1:api_to_ui`", notes)
            self.assertIn("`request:todayRecommendationRequest`", data_fetching)
            self.assertIn("`state:loading`", spec)

            validate = self.validate_output(out_dir)
            self.assertEqual(validate.returncode, 0, validate.stderr + validate.stdout)

    def test_strict_validation_rejects_missing_required_state_trace(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_dir = Path(tmp_dir) / "today-windvane"
            self.generate_sample(out_dir)
            spec_path = out_dir / "specs" / "today-windvane" / "spec.md"
            spec_path.write_text(
                spec_path.read_text(encoding="utf-8").replace("`state:loading`", "`state:tampered`"),
                encoding="utf-8",
            )

            validate = self.validate_output(out_dir)
            self.assertNotEqual(validate.returncode, 0, validate.stderr + validate.stdout)
            self.assertIn("state trace", validate.stderr + validate.stdout)


if __name__ == "__main__":
    unittest.main()
