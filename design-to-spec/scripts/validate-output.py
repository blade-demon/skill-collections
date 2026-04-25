#!/usr/bin/env python3
"""Validate generated design-to-spec output files against the YAML contracts."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    yaml = None


EVENT_PATTERN = re.compile(r"[a-z]+(?:-[a-z]+)+")


def load_yaml(path: Path) -> dict[str, Any]:
    if yaml is not None:
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            raise ValueError(f"{path}: invalid YAML: {exc}") from exc
    else:
        data = load_yaml_with_ruby(path)
    if not isinstance(data, dict):
        raise ValueError(f"{path}: top-level YAML must be a mapping")
    return data


def load_yaml_with_ruby(path: Path) -> Any:
    script = "require 'yaml'; require 'json'; puts JSON.generate(YAML.load_file(ARGV[0]))"
    try:
        result = subprocess.run(
            ["ruby", "-e", script, str(path)],
            check=True,
            text=True,
            capture_output=True,
        )
    except FileNotFoundError as exc:
        raise ValueError(f"{path}: PyYAML is unavailable and Ruby fallback is not installed") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip()
        raise ValueError(f"{path}: invalid YAML: {detail}") from exc
    return json.loads(result.stdout)


def read_text(path: Path) -> str:
    if not path.exists():
        raise ValueError(f"{path}: file does not exist")
    return path.read_text(encoding="utf-8")


def collect_endpoint_urls(api_doc: dict[str, Any]) -> dict[str, str]:
    endpoints = api_doc.get("api", {}).get("endpoints", []) or []
    return {
        endpoint.get("id"): endpoint.get("url")
        for endpoint in endpoints
        if endpoint.get("id") and endpoint.get("url")
    }


def collect_event_names(mapping_doc: dict[str, Any]) -> set[str]:
    events: set[str] = set()
    for binding in mapping_doc.get("mapping", {}).get("bindings", []) or []:
        if binding.get("direction") != "ui_to_event":
            continue
        target_event = binding.get("target_event", "")
        events.update(EVENT_PATTERN.findall(target_event))
        transform = binding.get("transform", "")
        events.update(EVENT_PATTERN.findall(transform))
    return events


def collect_open_questions(api_doc: dict[str, Any], mapping_doc: dict[str, Any]) -> list[dict[str, str]]:
    questions: list[dict[str, str]] = []
    questions.extend(api_doc.get("api", {}).get("open_questions", []) or [])
    questions.extend(mapping_doc.get("mapping", {}).get("open_questions", []) or [])
    return questions


def normalized_probe(text: str, length: int = 12) -> str:
    compact = re.sub(r"\s+", "", text)
    compact = re.sub(r"[`\"'()（）？?，,。.:：；;、]", "", compact)
    return compact[:length]


def validate_outputs(
    ui_doc: dict[str, Any],
    api_doc: dict[str, Any],
    mapping_doc: dict[str, Any],
    notes_text: str,
    data_fetching_text: str,
    spec_text: str,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    required_fragments = ["## ADDED Requirements", "### Requirement:", "#### Scenario:", "- WHEN", "- THEN"]
    if "## MODIFIED Requirements" in spec_text:
        required_fragments[0] = "## MODIFIED Requirements"
    for fragment in required_fragments:
        if fragment not in spec_text:
            errors.append(f"spec.md is missing OpenSpec fragment {fragment!r}")

    for state in ui_doc.get("ui", {}).get("states", []) or []:
        if state.get("required") is True:
            state_id = state.get("id", "")
            if state_id and state_id not in spec_text:
                errors.append(f"required state {state_id!r} is not mentioned in spec.md")
            assertion = state.get("render_assertion", "")
            if assertion and assertion not in spec_text and state_id not in spec_text:
                warnings.append(f"required state {state_id!r} render_assertion is not reflected in spec.md")

    endpoint_urls = collect_endpoint_urls(api_doc)
    for request in mapping_doc.get("mapping", {}).get("data_fetching", {}).get("requests", []) or []:
        endpoint_id = request.get("endpoint")
        endpoint_url = endpoint_urls.get(endpoint_id)
        if endpoint_id and endpoint_url and endpoint_url not in data_fetching_text:
            errors.append(f"data-fetching.md does not mention endpoint {endpoint_url!r} for request {request.get('id')!r}")

    combined_notes_spec = notes_text + "\n" + spec_text
    for event_name in collect_event_names(mapping_doc):
        if event_name not in combined_notes_spec:
            errors.append(f"event {event_name!r} is not mentioned in notes.md or spec.md")

    normalized_notes = normalized_probe(notes_text, length=len(notes_text))
    for question in collect_open_questions(api_doc, mapping_doc):
        content = question.get("content", "")
        priority = question.get("priority", "")
        probe = normalized_probe(content)
        if priority == "P0" and probe and probe not in normalized_notes:
            warnings.append(f"P0 open question may be missing from notes.md: {content}")

    if "## 待确认项汇总" not in data_fetching_text:
        warnings.append("data-fetching.md is missing a 待确认项汇总 section")
    if "## 开放问题" not in notes_text:
        errors.append("notes.md is missing an 开放问题 section")
    if "## 埋点锚点" not in notes_text:
        warnings.append("notes.md is missing an 埋点锚点 section")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate generated design-to-spec output files.")
    parser.add_argument("--ui", required=True, type=Path, help="Path to ui-schema.yaml")
    parser.add_argument("--api", required=True, type=Path, help="Path to api-schema.yaml")
    parser.add_argument("--mapping", required=True, type=Path, help="Path to mapping-logic.yaml")
    parser.add_argument("--notes", required=True, type=Path, help="Path to notes.md")
    parser.add_argument("--data-fetching", required=True, type=Path, help="Path to data-fetching.md")
    parser.add_argument("--spec", required=True, type=Path, help="Path to spec.md")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    args = parser.parse_args()

    try:
        ui_doc = load_yaml(args.ui)
        api_doc = load_yaml(args.api)
        mapping_doc = load_yaml(args.mapping)
        notes_text = read_text(args.notes)
        data_fetching_text = read_text(args.data_fetching)
        spec_text = read_text(args.spec)
        errors, warnings = validate_outputs(ui_doc, api_doc, mapping_doc, notes_text, data_fetching_text, spec_text)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    for warning in warnings:
        print(f"WARN: {warning}", file=sys.stderr)
    if args.strict:
        errors.extend(warnings)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("OK: output files are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
