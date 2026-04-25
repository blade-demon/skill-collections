#!/usr/bin/env python3
"""Validate design-to-spec YAML contracts.

This first validates each contract against its JSON Schema, then checks the
cross-file references that commonly drift between UI_Schema, API_Schema, and
Mapping_Logic before the final spec assembly step.
"""

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


SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schemas"


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


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"{path}: top-level JSON must be a mapping")
    return data


def format_schema_path(error_path: Any) -> str:
    parts = [str(item) for item in error_path]
    return ".".join(parts) if parts else "<root>"


def validate_schema(label: str, document: dict[str, Any], schema_path: Path) -> list[str]:
    schema = load_json(schema_path)
    return validate_json_schema(label, document, schema)


def validate_json_schema(label: str, document: Any, schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    def resolve_ref(ref: str) -> dict[str, Any]:
        if not ref.startswith("#/"):
            raise ValueError(f"unsupported JSON Schema ref {ref!r}")
        node: Any = schema
        for part in ref[2:].split("/"):
            node = node[part]
        if not isinstance(node, dict):
            raise ValueError(f"JSON Schema ref {ref!r} does not point to an object")
        return node

    def type_matches(value: Any, expected: str) -> bool:
        if expected == "object":
            return isinstance(value, dict)
        if expected == "array":
            return isinstance(value, list)
        if expected == "string":
            return isinstance(value, str)
        if expected == "boolean":
            return isinstance(value, bool)
        if expected == "number":
            return isinstance(value, (int, float)) and not isinstance(value, bool)
        return True

    def check(value: Any, node: dict[str, Any], path: list[Any]) -> None:
        if "$ref" in node:
            check(value, resolve_ref(node["$ref"]), path)
            return

        if "oneOf" in node:
            matches = []
            for option in node["oneOf"]:
                before = len(errors)
                local_errors: list[str] = []
                original_errors = errors[:]
                errors.clear()
                check(value, option, path)
                local_errors.extend(errors)
                errors.clear()
                errors.extend(original_errors)
                if not local_errors and len(errors) == before:
                    matches.append(option)
            if len(matches) != 1:
                errors.append(f"{label}: schema error at {format_schema_path(path)}: value must match exactly one schema")
            return

        expected_type = node.get("type")
        if isinstance(expected_type, list):
            if not any(type_matches(value, item) for item in expected_type):
                errors.append(f"{label}: schema error at {format_schema_path(path)}: expected one of {expected_type}")
                return
        elif isinstance(expected_type, str) and not type_matches(value, expected_type):
            errors.append(f"{label}: schema error at {format_schema_path(path)}: expected {expected_type}")
            return

        if "const" in node and value != node["const"]:
            errors.append(f"{label}: schema error at {format_schema_path(path)}: expected {node['const']!r}")
        if "enum" in node and value not in node["enum"]:
            errors.append(f"{label}: schema error at {format_schema_path(path)}: unsupported value {value!r}")

        if isinstance(value, str):
            if len(value) < node.get("minLength", 0):
                errors.append(f"{label}: schema error at {format_schema_path(path)}: string is too short")
            if "pattern" in node and not re.search(node["pattern"], value):
                errors.append(f"{label}: schema error at {format_schema_path(path)}: does not match pattern {node['pattern']!r}")

        if isinstance(value, list):
            if len(value) < node.get("minItems", 0):
                errors.append(f"{label}: schema error at {format_schema_path(path)}: array has too few items")
            item_schema = node.get("items")
            if isinstance(item_schema, dict):
                for index, item in enumerate(value):
                    check(item, item_schema, path + [index])

        if isinstance(value, dict):
            required = node.get("required", []) or []
            for key in required:
                if key not in value:
                    errors.append(f"{label}: schema error at {format_schema_path(path + [key])}: missing required property")
            properties = node.get("properties", {}) or {}
            additional = node.get("additionalProperties", True)
            for key, item in value.items():
                if key in properties:
                    check(item, properties[key], path + [key])
                elif additional is False:
                    errors.append(f"{label}: schema error at {format_schema_path(path + [key])}: additional property is not allowed")

    check(document, schema, [])
    return errors


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


def find_duplicates(items: list[Any]) -> set[Any]:
    seen: set[Any] = set()
    duplicates: set[Any] = set()
    for item in items:
        if item in seen:
            duplicates.add(item)
        else:
            seen.add(item)
    return duplicates


def validate_unique_values(label: str, values: list[Any], errors: list[str]) -> None:
    for duplicate in sorted(find_duplicates([value for value in values if value])):
        errors.append(f"{label} contains duplicate value {duplicate!r}")


def validate_uniqueness(ui: dict[str, Any], api: dict[str, Any], mapping: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    components = ui.get("components", []) or []
    states = ui.get("states", []) or []
    validate_unique_values("ui.components[].id", [item.get("id") for item in components], errors)
    validate_unique_values("ui.states[].id", [item.get("id") for item in states], errors)

    endpoints = api.get("endpoints", []) or []
    validate_unique_values("api.endpoints[].id", [item.get("id") for item in endpoints], errors)
    for endpoint in endpoints:
        endpoint_label = f"api.endpoints[{endpoint.get('id', '<unknown>')}]"
        validate_unique_values(
            f"{endpoint_label}.params[].name",
            [item.get("name") for item in endpoint.get("params", []) or []],
            errors,
        )
        validate_unique_values(
            f"{endpoint_label}.response_fields[].name",
            [item.get("name") for item in endpoint.get("response_fields", []) or []],
            errors,
        )

    validate_unique_values(
        "api.open_questions[].id",
        [item.get("id") for item in api.get("open_questions", []) or []],
        errors,
    )

    requests = mapping.get("data_fetching", {}).get("requests", []) or []
    validate_unique_values("mapping.data_fetching.requests[].id", [item.get("id") for item in requests], errors)
    validate_unique_values(
        "mapping.open_questions[].id",
        [item.get("id") for item in mapping.get("open_questions", []) or []],
        errors,
    )

    return errors


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

    errors.extend(validate_uniqueness(ui, api, mapping))

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
    parser.add_argument("--ui-schema", type=Path, default=SCHEMA_DIR / "ui-schema.json")
    parser.add_argument("--api-schema", type=Path, default=SCHEMA_DIR / "api-schema.json")
    parser.add_argument("--mapping-schema", type=Path, default=SCHEMA_DIR / "mapping-logic.json")
    args = parser.parse_args()

    try:
        ui_doc = load_yaml(args.ui)
        api_doc = load_yaml(args.api)
        mapping_doc = load_yaml(args.mapping)
        errors = []
        errors.extend(validate_schema("ui-schema", ui_doc, args.ui_schema))
        errors.extend(validate_schema("api-schema", api_doc, args.api_schema))
        errors.extend(validate_schema("mapping-logic", mapping_doc, args.mapping_schema))
        if not errors:
            errors.extend(validate(ui_doc, api_doc, mapping_doc))
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
