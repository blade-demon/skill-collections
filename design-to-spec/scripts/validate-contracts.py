#!/usr/bin/env python3
"""Validate design-to-spec YAML contracts.

This checks the cross-file references that commonly drift between UI_Schema,
API_Schema, and Mapping_Logic before the final spec assembly step.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("PyYAML is required: python3 -m pip install pyyaml", file=sys.stderr)
    sys.exit(2)


def load_yaml(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"{path}: top-level YAML must be a mapping")
    return data


def collect_api_ids(api: dict[str, Any]) -> tuple[set[str], set[str], set[str]]:
    endpoints = api.get("api", {}).get("endpoints", []) or []
    endpoint_ids: set[str] = set()
    params: set[str] = set()
    fields: set[str] = set()
    for endpoint in endpoints:
        endpoint_id = endpoint.get("id")
        if endpoint_id:
            endpoint_ids.add(endpoint_id)
        for param in endpoint.get("params", []) or []:
            name = param.get("name")
            if name:
                params.add(name)
        for field in endpoint.get("response_fields", []) or []:
            name = field.get("name")
            if name:
                fields.add(name)
    return endpoint_ids, params, fields


def validate(ui_doc: dict[str, Any], api_doc: dict[str, Any], mapping_doc: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    ui = ui_doc.get("ui", {})
    api = api_doc.get("api", {})
    mapping = mapping_doc.get("mapping", {})

    if not isinstance(ui, dict):
        errors.append("ui-schema: missing ui mapping")
        ui = {}
    if not isinstance(api, dict):
        errors.append("api-schema: missing api mapping")
        api = {}
    if not isinstance(mapping, dict):
        errors.append("mapping-logic: missing mapping mapping")
        mapping = {}

    component_name = ui.get("name")
    if component_name and mapping.get("component") and mapping.get("component") != component_name:
        errors.append(f"mapping.component {mapping.get('component')!r} does not match ui.name {component_name!r}")

    components = ui.get("components", []) or []
    component_ids = {item.get("id") for item in components if item.get("id")}
    state_ids = {item.get("id") for item in ui.get("states", []) or [] if item.get("id")}
    state_assertions = {
        item.get("id"): item.get("render_assertion")
        for item in ui.get("states", []) or []
        if item.get("id")
    }

    for item in components:
        parent_id = item.get("parent_id")
        if parent_id and parent_id != "root" and parent_id not in component_ids:
            errors.append(f"ui.components[{item.get('id')}].parent_id references missing component {parent_id!r}")

    endpoint_ids, param_names, response_fields = collect_api_ids(api_doc)
    requests = mapping.get("data_fetching", {}).get("requests", []) or []
    request_ids = {item.get("id") for item in requests if item.get("id")}
    for request in requests:
        endpoint = request.get("endpoint")
        if endpoint and endpoint_ids and endpoint not in endpoint_ids:
            errors.append(f"request {request.get('id')!r} references missing endpoint {endpoint!r}")
        for dependency in request.get("depends_on", []) or []:
            if dependency not in request_ids:
                errors.append(f"request {request.get('id')!r} depends on missing request {dependency!r}")

    for binding in mapping.get("bindings", []) or []:
        direction = binding.get("direction")
        if direction == "ui_to_api":
            source_ui = binding.get("source_ui")
            target_api = binding.get("target_api")
            if source_ui not in component_ids:
                errors.append(f"binding source_ui references missing component {source_ui!r}")
            if target_api not in param_names:
                errors.append(f"binding target_api references missing API param {target_api!r}")
        elif direction == "api_to_ui":
            source_api = binding.get("source_api")
            target_ui = binding.get("target_ui")
            if source_api not in response_fields:
                errors.append(f"binding source_api references missing response field {source_api!r}")
            if target_ui not in component_ids:
                errors.append(f"binding target_ui references missing component {target_ui!r}")
        elif direction == "ui_to_event":
            source_ui = binding.get("source_ui")
            target_event = binding.get("target_event")
            if source_ui not in component_ids:
                errors.append(f"binding source_ui references missing component {source_ui!r}")
            if not target_event:
                errors.append("ui_to_event binding is missing target_event")
        else:
            errors.append(f"binding has unsupported direction {direction!r}")

    for transition in mapping.get("state_machine", []) or []:
        to_state = transition.get("to")
        if to_state not in state_ids:
            errors.append(f"state_machine transition points to missing state {to_state!r}")
        if not transition.get("render_assertion") and not state_assertions.get(to_state):
            errors.append(f"state_machine transition to {to_state!r} has no render_assertion fallback")

    for state in ui.get("states", []) or []:
        if state.get("required") is True and not state.get("render_assertion"):
            errors.append(f"required state {state.get('id')!r} is missing render_assertion")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate design-to-spec YAML contracts.")
    parser.add_argument("--ui", required=True, type=Path, help="Path to ui-schema.yaml")
    parser.add_argument("--api", required=True, type=Path, help="Path to api-schema.yaml")
    parser.add_argument("--mapping", required=True, type=Path, help="Path to mapping-logic.yaml")
    args = parser.parse_args()

    try:
        ui_doc = load_yaml(args.ui)
        api_doc = load_yaml(args.api)
        mapping_doc = load_yaml(args.mapping)
        errors = validate(ui_doc, api_doc, mapping_doc)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("OK: contracts are valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
