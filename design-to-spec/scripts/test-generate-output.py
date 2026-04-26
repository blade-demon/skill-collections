#!/usr/bin/env python3
"""Regression tests for deterministic design-to-spec output generation."""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent
SAMPLE_DIR = SKILL_DIR / "examples" / "today-windvane"


class GenerateOutputTest(unittest.TestCase):
    def test_generates_contracts_and_valid_outputs_from_sample(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_dir = Path(tmp_dir) / "today-windvane"
            script = SKILL_DIR / "scripts" / "generate-output.py"
            ui = SAMPLE_DIR / "contracts" / "ui-schema.yaml"
            api = SAMPLE_DIR / "contracts" / "api-schema.yaml"
            mapping = SAMPLE_DIR / "contracts" / "mapping-logic.yaml"

            result = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    "--ui",
                    str(ui),
                    "--api",
                    str(api),
                    "--mapping",
                    str(mapping),
                    "--out-dir",
                    str(out_dir),
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)

            generated_ui = out_dir / "contracts" / "ui-schema.yaml"
            generated_api = out_dir / "contracts" / "api-schema.yaml"
            generated_mapping = out_dir / "contracts" / "mapping-logic.yaml"
            notes = out_dir / "notes.md"
            data_fetching = out_dir / "data-fetching.md"
            spec = out_dir / "specs" / "today-windvane" / "spec.md"

            for path in [generated_ui, generated_api, generated_mapping, notes, data_fetching, spec]:
                self.assertTrue(path.exists(), f"missing generated file: {path}")

            self.assertEqual(generated_ui.read_text(encoding="utf-8"), ui.read_text(encoding="utf-8"))
            self.assertIn("## 状态枚举", notes.read_text(encoding="utf-8"))
            self.assertIn("GET /api/v1/today/recommendation", data_fetching.read_text(encoding="utf-8"))
            self.assertIn("## ADDED Requirements", spec.read_text(encoding="utf-8"))

            validate = subprocess.run(
                [
                    sys.executable,
                    str(SKILL_DIR / "scripts" / "validate-output.py"),
                    "--strict",
                    "--ui",
                    str(generated_ui),
                    "--api",
                    str(generated_api),
                    "--mapping",
                    str(generated_mapping),
                    "--notes",
                    str(notes),
                    "--data-fetching",
                    str(data_fetching),
                    "--spec",
                    str(spec),
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(validate.returncode, 0, validate.stderr + validate.stdout)

    def test_generation_is_idempotent_when_contracts_already_live_in_output_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_dir = Path(tmp_dir) / "today-windvane"
            contracts_dir = out_dir / "contracts"
            contracts_dir.mkdir(parents=True)
            ui = contracts_dir / "ui-schema.yaml"
            api = contracts_dir / "api-schema.yaml"
            mapping = contracts_dir / "mapping-logic.yaml"
            shutil.copyfile(SAMPLE_DIR / "contracts" / "ui-schema.yaml", ui)
            shutil.copyfile(SAMPLE_DIR / "contracts" / "api-schema.yaml", api)
            shutil.copyfile(SAMPLE_DIR / "contracts" / "mapping-logic.yaml", mapping)

            result = subprocess.run(
                [
                    sys.executable,
                    str(SKILL_DIR / "scripts" / "generate-output.py"),
                    "--ui",
                    str(ui),
                    "--api",
                    str(api),
                    "--mapping",
                    str(mapping),
                    "--out-dir",
                    str(out_dir),
                ],
                text=True,
                capture_output=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertTrue((out_dir / "notes.md").exists())


if __name__ == "__main__":
    unittest.main()
