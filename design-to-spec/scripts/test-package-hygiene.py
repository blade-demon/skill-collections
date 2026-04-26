#!/usr/bin/env python3
"""Packaging hygiene checks for the design-to-spec skill."""

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = SKILL_DIR.parent


class PackageHygieneTest(unittest.TestCase):
    def test_agent_metadata_references_existing_assets(self) -> None:
        metadata = SKILL_DIR / "agents" / "openai.yaml"
        text = metadata.read_text(encoding="utf-8")
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.startswith(("icon_small:", "icon_large:")):
                continue
            asset = stripped.split(":", 1)[1].strip().strip('"').strip("'")
            self.assertTrue((SKILL_DIR / asset).exists(), f"missing metadata asset: {asset}")

    def test_stack_hints_reference_notes_not_design_doc(self) -> None:
        for path in (SKILL_DIR / "references" / "stack-hints").glob("*.md"):
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("design.md", text, f"{path} should refer to notes.md")

    def test_no_tracked_ds_store_files(self) -> None:
        result = subprocess.run(
            ["git", "ls-files", "*DS_Store"],
            cwd=REPO_DIR,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        existing = [
            path
            for path in result.stdout.splitlines()
            if path and (REPO_DIR / path).exists()
        ]
        self.assertEqual(existing, [], f"tracked .DS_Store files still exist:\n{existing}")


if __name__ == "__main__":
    unittest.main()
