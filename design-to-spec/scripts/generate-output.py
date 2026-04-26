#!/usr/bin/env python3
"""Generate design-to-spec markdown outputs from YAML contracts.

This script is intentionally conservative: contracts remain the single source
of truth, and generated markdown only reflects fields present in those
contracts.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
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


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def kebab_case(value: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", value)
    value = re.sub(r"[^A-Za-z0-9]+", "-", value)
    return value.strip("-").lower() or "component"


def md_escape(value: Any) -> str:
    text = "" if value is None else str(value)
    return text.replace("|", "\\|").replace("\n", " ")


def ts_type(field: dict[str, Any]) -> str:
    field_type = field.get("type", "unknown")
    if field_type == "array":
        item_type = field.get("item_type") or "unknown"
        return f"{item_type}[]"
    if field.get("enums"):
        return " | ".join(repr(item) for item in field["enums"])
    return str(field_type)


def field_names(fields: list[dict[str, Any]]) -> str:
    return ", ".join(field.get("name", "") for field in fields) or "无"


def endpoint_label(endpoint: dict[str, Any] | None) -> str:
    if not endpoint:
        return "none"
    method = endpoint.get("method", "")
    url = endpoint.get("url", "")
    return f"{method} {url}".strip()


def collect_questions(api: dict[str, Any], mapping: dict[str, Any]) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    questions.extend(api.get("open_questions", []) or [])
    questions.extend(mapping.get("open_questions", []) or [])
    return questions


def collect_event_names(mapping: dict[str, Any]) -> list[str]:
    events: list[str] = []
    for binding in mapping.get("bindings", []) or []:
        if binding.get("direction") != "ui_to_event":
            continue
        for source in [binding.get("target_event", ""), binding.get("transform", "")]:
            for event in EVENT_PATTERN.findall(str(source)):
                if event not in events:
                    events.append(event)
    return events


def state_assertions(ui: dict[str, Any]) -> dict[str, str]:
    return {
        state.get("id"): state.get("render_assertion", "")
        for state in ui.get("states", []) or []
        if state.get("id")
    }


def generate_notes(ui: dict[str, Any], api: dict[str, Any], mapping: dict[str, Any], capability: str) -> str:
    component = ui.get("name", "Component")
    endpoints = api.get("endpoints", []) or []
    endpoint_by_id = {endpoint.get("id"): endpoint for endpoint in endpoints}
    questions = collect_questions(api, mapping)
    events = collect_event_names(mapping)

    lines: list[str] = [
        f"# {component} — 设计笔记",
        "",
        "> 由 `design-to-spec/scripts/generate-output.py` 根据 YAML 契约生成。此文件是协作草稿，`needs_human_input` 和开放问题需要人类确认。",
        "",
        "## 为什么",
        "",
        f"`{component}` 将设计稿中的可见结构、接口字段和交互状态固化为可实现规格。",
        "",
        "## 决策",
        "",
        "- **契约优先** — 本文仅使用 `contracts/*.yaml` 中的事实，不重新分析设计稿或接口文档。",
        "- **状态可测试** — `required: true` 的状态会进入 OpenSpec Scenario。",
        "",
        "## 数据契约",
        "",
        "```ts",
        f"interface {component}Data {{",
    ]
    response_fields: list[dict[str, Any]] = []
    request_body_fields: list[dict[str, Any]] = []
    error_shapes: list[dict[str, Any]] = []
    for endpoint in endpoints:
        response_fields.extend(endpoint.get("response_fields", []) or [])
        request_body_fields.extend(endpoint.get("request_body", []) or [])
        error_shapes.extend(endpoint.get("error_shape", []) or [])
    if response_fields:
        for field in response_fields:
            nullable = " | null" if field.get("nullable") else ""
            lines.append(
                f"  // {field.get('name')}: {ts_type(field)}{nullable};  // source: api — {field.get('notes', '')}"
            )
    else:
        lines.append("  // No API response fields. Data is expected from props or parent context.")
    lines.extend(
        [
            "}",
            "```",
            "",
        ]
    )

    if response_fields:
        lines.extend(
            [
                "### 接口字段映射表",
                "",
                "| 接口字段名 | 接口类型 | 枚举值（全量） | UI 中展示为 | 来源标注 | 备注 |",
                "|-----------|---------|--------------|------------|---------|------|",
            ]
        )
        for field in response_fields:
            enums = " / ".join(str(item) for item in field.get("enums", []) or []) or "—"
            lines.append(
                "| `{name}` | `{type}` | {enums} | {ui_target} | `api` | {notes} |".format(
                    name=md_escape(field.get("name")),
                    type=md_escape(ts_type(field)),
                    enums=md_escape(enums),
                    ui_target=md_escape("由 Mapping_Logic.bindings 指定"),
                    notes=md_escape(field.get("notes", "")),
                )
            )
        lines.append("")

    if request_body_fields:
        lines.extend(
            [
                "### 请求体字段映射表",
                "",
                "| request_body 字段 | 类型 | 必填 | 可空 | 枚举值 | 说明 |",
                "| ----------------- | ---- | ---- | ---- | ------ | ---- |",
            ]
        )
        for field in request_body_fields:
            enums = " / ".join(str(item) for item in field.get("enums", []) or []) or "—"
            required = "true" if field.get("required") else "false"
            nullable = "true" if field.get("nullable") else "false"
            lines.append(
                f"| `{md_escape(field.get('name'))}` | `{md_escape(ts_type(field))}` | {required} | {nullable} | {md_escape(enums)} | {md_escape(field.get('notes'))} |"
            )
        lines.append("")

    if endpoints:
        lines.extend(
            [
                "### 接口元信息",
                "",
                "| endpoint | auth_required | cache_key_fields | pagination | status_codes |",
                "| -------- | ------------- | ---------------- | ---------- | ------------ |",
            ]
        )
        for endpoint in endpoints:
            pagination = endpoint.get("pagination") or {}
            pagination_label = pagination.get("type", "none")
            cache_keys = ", ".join(endpoint.get("cache_key_fields", []) or []) or "—"
            status_codes = ", ".join(str(code) for code in endpoint.get("status_codes", []) or []) or "—"
            lines.append(
                f"| `{md_escape(endpoint_label(endpoint))}` | {str(bool(endpoint.get('auth_required'))).lower()} | {md_escape(cache_keys)} | {md_escape(pagination_label)} | {md_escape(status_codes)} |"
            )
        lines.append("")

    if error_shapes:
        lines.extend(
            [
                "### 错误结构映射表",
                "",
                "| code | message_field | retryable | ui_state | notes |",
                "| ---- | ------------- | --------- | -------- | ----- |",
            ]
        )
        for error in error_shapes:
            lines.append(
                f"| `{md_escape(error.get('code'))}` | `{md_escape(error.get('message_field'))}` | {str(bool(error.get('retryable'))).lower()} | `{md_escape(error.get('ui_state'))}` | {md_escape(error.get('notes'))} |"
            )
        lines.append("")

    lines.extend(
        [
            "## 数据获取方式",
            "",
            "| 接口/方法名 | 调用时机 | 请求关键参数 | 响应关键字段 | 缓存策略 | 补充说明 |",
            "| --------- | ------- | ---------- | ---------- | ------- | ------- |",
        ]
    )
    requests = mapping.get("data_fetching", {}).get("requests", []) or []
    if requests:
        for request in requests:
            endpoint = endpoint_by_id.get(request.get("endpoint"))
            params = ", ".join(param.get("name", "") for param in (endpoint or {}).get("params", []) or []) or "无"
            fields = field_names((endpoint or {}).get("response_fields", []) or [])
            lines.append(
                f"| `{endpoint_label(endpoint)}` | `{md_escape(request.get('trigger'))}` | {md_escape(params)} | {md_escape(fields)} | 待项目确认 | request `{md_escape(request.get('id'))}`, call_type `{md_escape(request.get('call_type'))}` |"
            )
    else:
        lines.append("| 无直接请求 | — | — | — | — | 数据由父组件或宿主上下文传入 |")
    lines.append("")

    lines.extend(
        [
            "## 状态枚举",
            "",
            "| 状态 | 触发条件 | UI 表现 | required | source | scope | scope_components | render_assertion |",
            "| ---- | -------- | ------- | -------- | ------ | ----- | ---------------- | ---------------- |",
        ]
    )
    for state in ui.get("states", []) or []:
        scope_components = ", ".join(state.get("scope_components", []) or []) or "—"
        lines.append(
            "| `{id}` | {trigger} | {confidence} | {required} | {source} | {scope} | {scope_components} | {assertion} |".format(
                id=md_escape(state.get("id")),
                trigger=md_escape(state.get("trigger")),
                confidence=md_escape(state.get("confidence")),
                required=str(bool(state.get("required"))).lower(),
                source=md_escape(state.get("source")),
                scope=md_escape(state.get("scope", "component")),
                scope_components=md_escape(scope_components),
                assertion=md_escape(state.get("render_assertion")),
            )
        )
    lines.append("")

    lines.extend(
        [
            "## 组件分解",
            "",
            "| 组件 | type | semantic_type | parent_id | role | repeat_source | 目的 | 复用信号 |",
            "| ---- | ---- | ------------- | --------- | ---- | ------------- | ---- | -------- |",
        ]
    )
    for component_item in ui.get("components", []) or []:
        lines.append(
            "| `{id}` | `{type}` | `{semantic_type}` | `{parent}` | `{role}` | `{repeat}` | {notes} | {reuse} |".format(
                id=md_escape(component_item.get("id")),
                type=md_escape(component_item.get("type")),
                semantic_type=md_escape(component_item.get("semantic_type", "")),
                parent=md_escape(component_item.get("parent_id")),
                role=md_escape(component_item.get("role")),
                repeat=md_escape(component_item.get("repeat_source")),
                notes=md_escape(component_item.get("notes")),
                reuse="atom-candidate" if component_item.get("repeat_source") else "component-local",
            )
        )
    lines.extend(
        [
            "",
            "## 布局陷阱",
            "",
            f"- {md_escape(ui.get('layout', {}).get('notes', '按设计稿约束实现布局。'))}",
            "",
            "## 置信度地图",
            "",
            "| 元素 / 行为 | 状态 | 备注 |",
            "| ----------- | ---- | ---- |",
        ]
    )
    for component_item in ui.get("components", []) or []:
        lines.append(
            f"| `{md_escape(component_item.get('id'))}` | {md_escape(component_item.get('confidence'))} | {md_escape(component_item.get('notes'))} |"
        )
    for state in ui.get("states", []) or []:
        lines.append(
            f"| `{md_escape(state.get('id'))}` | {md_escape(state.get('confidence'))} | {md_escape(state.get('trigger'))} |"
        )

    lines.extend(["", "## 开放问题", ""])
    if questions:
        for index, question in enumerate(questions, start=1):
            lines.append(f"{index}. [{md_escape(question.get('priority'))}] {md_escape(question.get('content'))}")
    else:
        lines.append("无。")

    lines.extend(
        [
            "",
            "## 计划提示",
            "",
            "- `generated_from_contracts`",
            "- `validate_output_required`",
            "",
            "## 交叉引用",
            "",
            "- 输入契约：`./contracts/ui-schema.yaml`、`./contracts/api-schema.yaml`、`./contracts/mapping-logic.yaml`",
            f"- 规格增量：`./specs/{capability}/spec.md`",
            "",
            "## 建议的下一步",
            "",
            "将完整输出目录交给规划或实现流程；下游不应重新阅读原始设计稿，而应消费本目录和 `contracts/*.yaml`。",
            "",
            "## Traceability",
            "",
            "| trace_id | kind | source | target | notes |",
            "| -------- | ---- | ------ | ------ | ----- |",
        ]
    )
    for component_item in ui.get("components", []) or []:
        component_id = component_item.get("id", "")
        lines.append(
            f"| `component:{md_escape(component_id)}` | component | `{md_escape(component_id)}` | `{md_escape(component_item.get('parent_id'))}` | type `{md_escape(component_item.get('type'))}`, semantic `{md_escape(component_item.get('semantic_type', ''))}` |"
        )
    for index, binding in enumerate(mapping.get("bindings", []) or [], start=1):
        direction = binding.get("direction", "")
        if direction == "ui_to_api":
            source = binding.get("source_ui", "")
            target = binding.get("target_api", "")
        elif direction == "api_to_ui":
            source = binding.get("source_api", "")
            target = binding.get("target_ui", "")
        else:
            source = binding.get("source_ui", "")
            target = binding.get("target_event", "")
        lines.append(
            f"| `binding:{index}:{md_escape(direction)}` | binding | `{md_escape(source)}` | `{md_escape(target)}` | transform `{md_escape(binding.get('transform', 'none'))}` |"
        )
    for state in ui.get("states", []) or []:
        state_id = state.get("id", "")
        scope_components = ", ".join(state.get("scope_components", []) or []) or "component"
        lines.append(
            f"| `state:{md_escape(state_id)}` | state | `{md_escape(state_id)}` | `{md_escape(scope_components)}` | required `{str(bool(state.get('required'))).lower()}` |"
        )

    lines.extend(
        [
            "",
            "## 埋点锚点",
            "",
            "| 锚点 ID | 触发 Scenario（对应 spec.md 标题或 Requirement） | 类型 | 关键参数（语义层） | 备注 |",
            "| ------- | ----------------------------------------- | ---- | ---------------- | ---- |",
        ]
    )
    if events:
        for event in events:
            event_type = "click" if event.startswith(("tap-", "submit-")) else "exposure"
            lines.append(f"| `{event}` | `{event}` | {event_type} | 由事件 detail 决定 | 从 `ui_to_event` 绑定生成 |")
    else:
        lines.append("| `not-tracked` | 无交互事件 | not-tracked | — | 契约未声明 `ui_to_event` 绑定 |")

    return "\n".join(lines)


def generate_data_fetching(ui: dict[str, Any], api: dict[str, Any], mapping: dict[str, Any]) -> str:
    endpoints = api.get("endpoints", []) or []
    endpoint_by_id = {endpoint.get("id"): endpoint for endpoint in endpoints}
    requests = mapping.get("data_fetching", {}).get("requests", []) or []
    questions = collect_questions(api, mapping)

    lines: list[str] = [
        f"# {mapping.get('component', 'Component')} — 数据获取逻辑设计",
        "",
        "> 由 `design-to-spec/scripts/generate-output.py` 根据 YAML 契约生成。",
        "",
        "## 数据流向",
        "",
        "```",
        "contracts/api-schema.yaml",
        "  -> contracts/mapping-logic.yaml",
        "    -> component state / props",
        "      -> UI components",
        "```",
        "",
        "## 触发时机与条件",
        "",
        "| 触发事件 | 前提条件 | 备注 |",
        "|---------|---------|------|",
    ]
    if requests:
        for request in requests:
            lines.append(
                f"| `{md_escape(request.get('trigger'))}` | endpoint `{md_escape(request.get('endpoint'))}` 可用 | call_type `{md_escape(request.get('call_type'))}` |"
            )
    else:
        lines.append("| 无请求 | 数据由父组件通过 Props 传入 | 纯展示组件 |")

    lines.extend(
        [
            "",
            "## 请求链路",
            "",
            "### 请求清单",
            "",
            "| request id | trace_id | 接口 | 触发时机 | call_type | 依赖 | 用途 |",
            "| ---------- | -------- | ---- | -------- | --------- | ---- | ---- |",
        ]
    )
    if requests:
        for request in requests:
            endpoint = endpoint_by_id.get(request.get("endpoint"))
            depends_on = ", ".join(request.get("depends_on", []) or []) or "无"
            pagination = (endpoint or {}).get("pagination", {}) or {}
            use = "主数据请求"
            if pagination.get("type") and pagination.get("type") != "none":
                use = f"{pagination.get('type')} pagination"
            lines.append(
                f"| `{md_escape(request.get('id'))}` | `request:{md_escape(request.get('id'))}` | `{md_escape(endpoint_label(endpoint))}` | `{md_escape(request.get('trigger'))}` | `{md_escape(request.get('call_type'))}` | {md_escape(depends_on)} | {md_escape(use)} |"
            )
    else:
        lines.append("| — | — | 无直接接口 | — | — | — | 父组件供数 |")

    lines.extend(["", "### 请求参数", ""])
    if requests:
        for request in requests:
            endpoint = endpoint_by_id.get(request.get("endpoint"))
            lines.extend(
                [
                    f"#### `{md_escape(request.get('id'))}`",
                    "",
                    "| 参数名 | 来源 | 类型 | 是否必传 | 说明 |",
                    "|-------|------|------|---------|------|",
                ]
            )
            params = (endpoint or {}).get("params", []) or []
            if params:
                for param in params:
                    required = "是" if param.get("required") else "否"
                    lines.append(
                        f"| `{md_escape(param.get('name'))}` | Mapping_Logic.bindings | `{md_escape(param.get('type'))}` | {required} | {md_escape(param.get('notes'))} |"
                    )
            else:
                lines.append("| — | — | — | — | 无请求参数 |")
            request_body = (endpoint or {}).get("request_body", []) or []
            if request_body:
                lines.extend(["", "**请求体字段**：", ""])
                for body_field in request_body:
                    required = "required" if body_field.get("required") else "optional"
                    lines.append(
                        f"- `{md_escape(body_field.get('name'))}` (`{md_escape(ts_type(body_field))}`, {required}) — {md_escape(body_field.get('notes'))}"
                    )
            fields = field_names((endpoint or {}).get("response_fields", []) or [])
            lines.extend(["", f"**响应关键字段**：{md_escape(fields)}。", ""])
    else:
        lines.append("无请求参数。")

    lines.extend(
        [
            "## 接口元信息",
            "",
            "| endpoint | auth_required | cache_key_fields | pagination | error_shape |",
            "| -------- | ------------- | ---------------- | ---------- | ----------- |",
        ]
    )
    if endpoints:
        for endpoint in endpoints:
            pagination = endpoint.get("pagination", {}) or {}
            cache_keys = ", ".join(endpoint.get("cache_key_fields", []) or []) or "—"
            errors = ", ".join(error.get("code", "") for error in endpoint.get("error_shape", []) or []) or "—"
            lines.append(
                f"| `{md_escape(endpoint_label(endpoint))}` | {str(bool(endpoint.get('auth_required'))).lower()} | {md_escape(cache_keys)} | {md_escape(pagination.get('type', 'none'))} | {md_escape(errors)} |"
            )
    else:
        lines.append("| — | false | — | none | — |")

    lines.extend(
        [
            "## 分页与无限滚动",
            "",
        ]
    )
    pagination_rows = [
        (endpoint, endpoint.get("pagination", {}) or {})
        for endpoint in endpoints
        if (endpoint.get("pagination", {}) or {}).get("type") and (endpoint.get("pagination", {}) or {}).get("type") != "none"
    ]
    if pagination_rows:
        lines.extend(
            [
                "| endpoint | type | request_fields | response_fields | notes |",
                "| -------- | ---- | -------------- | --------------- | ----- |",
            ]
        )
        for endpoint, pagination in pagination_rows:
            request_fields = ", ".join(pagination.get("request_fields", []) or []) or "—"
            response_fields = ", ".join(pagination.get("response_fields", []) or []) or "—"
            lines.append(
                f"| `{md_escape(endpoint_label(endpoint))}` | {md_escape(pagination.get('type'))} | {md_escape(request_fields)} | {md_escape(response_fields)} | {md_escape(pagination.get('notes', ''))} |"
            )
    else:
        lines.append("不涉及，除非契约中的请求或开放问题另有说明。")

    cache_policy = mapping.get("data_fetching", {}).get("cache_policy") or mapping.get("data_fetching", {}).get("cache") or {}
    retry_policy = mapping.get("data_fetching", {}).get("retry_policy") or {}
    concurrency_policy = mapping.get("data_fetching", {}).get("concurrency_policy") or {}
    lines.extend(
        [
            "",
            "## 缓存与复用策略",
            "",
        ]
    )
    if cache_policy:
        for key, value in cache_policy.items():
            lines.append(f"- **{md_escape(key)}**: {md_escape(value)}")
    else:
        lines.append("缓存策略未在契约中声明。")

    lines.extend(
        [
            "",
            "## 重试策略",
            "",
        ]
    )
    if retry_policy:
        for key, value in retry_policy.items():
            lines.append(f"- **{md_escape(key)}**: {md_escape(value)}")
    else:
        lines.append("重试策略未在契约中声明。")

    lines.extend(
        [
            "",
            "## 竞态与并发处理",
            "",
        ]
    )
    if concurrency_policy:
        for key, value in concurrency_policy.items():
            lines.append(f"- **{md_escape(key)}**: {md_escape(value)}")
    else:
        lines.append("如存在多请求依赖，按 `depends_on` 串联；重复触发时应忽略过期响应或取消旧请求，具体策略进入开放问题确认。")

    lines.extend(
        [
            "",
            "## 错误分级与降级策略",
            "",
            "| 错误类型 | 触发条件 | UI 表现 | 是否可重试 | 备注 |",
            "|---------|---------|---------|----------|------|",
            "| 请求失败 | `api_error` 或 request reject | 进入 `error` 状态 | 是，若存在 retry 交互 | 以 Mapping_Logic.state_machine 为准 |",
            "| 数据为空 | `api_success` 但数据满足 empty 条件 | 进入 `empty` 状态 | — | 不作为错误处理 |",
        ]
    )
    for endpoint in endpoints:
        for error in endpoint.get("error_shape", []) or []:
            retryable = "是" if error.get("retryable") else "否"
            lines.append(
                f"| `{md_escape(error.get('code'))}` | `{md_escape(error.get('message_field'))}` | `{md_escape(error.get('ui_state'))}` | {retryable} | {md_escape(error.get('notes'))} |"
            )

    lines.extend(
        [
            "",
            "## 状态机",
            "",
            "| from | event | to | render_assertion |",
            "| ---- | ----- | -- | ---------------- |",
        ]
    )
    state_fallback = state_assertions(ui)
    for transition in mapping.get("state_machine", []) or []:
        assertion = transition.get("render_assertion") or state_fallback.get(transition.get("to"), "")
        lines.append(
            f"| `{md_escape(transition.get('from'))}` | {md_escape(transition.get('event'))} | `{md_escape(transition.get('to'))}` | {md_escape(assertion)} |"
        )
    if not mapping.get("state_machine"):
        lines.append("| `idle` | 初始渲染 | `success` | renders main content |")

    lines.extend(["", "## 父组件约定", "", "若契约中无直接请求，父组件负责传入数据、loading、error 和交互回调。"])
    lines.extend(
        [
            "",
            "## 待确认项汇总",
            "",
            "| # | 待确认内容 | 需确认对象 | 优先级 |",
            "|---|-----------|----------|-------|",
        ]
    )
    if questions:
        for index, question in enumerate(questions, start=1):
            lines.append(f"| {index} | {md_escape(question.get('content'))} | PM / 设计 / 后端 | {md_escape(question.get('priority'))} |")
    else:
        lines.append("| — | 无 | — | — |")
    return "\n".join(lines)


def scenario_name(transition: dict[str, Any]) -> str:
    target = transition.get("to", "state")
    event = str(transition.get("event", "")).strip()
    if len(event) > 48:
        event = event[:45] + "..."
    return f"{target} state after {event}"


def generate_spec(ui: dict[str, Any], api: dict[str, Any], mapping: dict[str, Any], capability: str) -> str:
    component = ui.get("name", "Component")
    assertions = state_assertions(ui)
    lines: list[str] = [
        f"# {capability} — add-{capability} 的增量规格",
        "",
        "## ADDED Requirements",
        "",
        f"### Requirement: {component} 状态覆盖",
        "",
        "The system SHALL render each contract-defined required state with observable output.",
        "",
    ]

    covered_states: set[str] = set()
    for transition in mapping.get("state_machine", []) or []:
        to_state = str(transition.get("to", "state"))
        covered_states.add(to_state)
        assertion = transition.get("render_assertion") or assertions.get(to_state) or "needs_human_input"
        lines.extend(
            [
                f"#### Scenario: {scenario_name(transition)}",
                "",
                f"- WHEN {transition.get('event')}",
                f"- THEN {assertion} (`{to_state}`)",
                f"- AND trace id `state:{to_state}`",
                "",
            ]
        )

    for state in ui.get("states", []) or []:
        state_id = state.get("id")
        if state.get("required") is True and state_id not in covered_states:
            lines.extend(
                [
                    f"#### Scenario: {state_id} state fallback",
                    "",
                    f"- WHEN {state.get('trigger')}",
                    f"- THEN {state.get('render_assertion') or 'needs_human_input'} (`{state_id}`)",
                    f"- AND trace id `state:{state_id}`",
                    "",
                ]
            )

    events = collect_event_names(mapping)
    if events:
        lines.extend(
            [
                f"### Requirement: {component} 事件输出",
                "",
                "The system SHALL emit contract-defined UI events without inventing navigation or write-side effects.",
                "",
            ]
        )
        for event in events:
            lines.extend(
                [
                    f"#### Scenario: {event} event",
                    "",
                    f"- WHEN 用户触发 `{event}` 对应的 UI 行为",
                    f"- THEN 组件派发 `{event}` 事件 1 次",
                    "",
                ]
            )

    enum_fields = [
        field
        for endpoint in api.get("endpoints", []) or []
        for field in endpoint.get("response_fields", []) or []
        if field.get("enums")
    ]
    if enum_fields:
        lines.extend(
            [
                f"### Requirement: {component} 枚举字段展示",
                "",
                "The system SHALL preserve every API enum value as a distinct observable branch.",
                "",
            ]
        )
        for field in enum_fields:
            for enum_value in field.get("enums", []) or []:
                lines.extend(
                    [
                        f"#### Scenario: {field.get('name')} equals {enum_value}",
                        "",
                        f"- WHEN `{field.get('name')}` equals `{enum_value}`",
                        f"- THEN renders the UI branch documented for `{field.get('name')}` enum `{enum_value}`",
                        "",
                    ]
                )

    if not mapping.get("state_machine") and not ui.get("states"):
        lines.extend(
            [
                "#### Scenario: default render",
                "",
                "- WHEN component receives valid props",
                "- THEN renders main content",
                "",
            ]
        )
    return "\n".join(lines)


def copy_contracts(ui_path: Path, api_path: Path, mapping_path: Path, out_dir: Path) -> tuple[Path, Path, Path]:
    contracts_dir = out_dir / "contracts"
    contracts_dir.mkdir(parents=True, exist_ok=True)
    targets = (
        contracts_dir / "ui-schema.yaml",
        contracts_dir / "api-schema.yaml",
        contracts_dir / "mapping-logic.yaml",
    )
    for source, target in zip((ui_path, api_path, mapping_path), targets):
        if source.resolve() != target.resolve():
            shutil.copyfile(source, target)
    return targets


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate design-to-spec output files from YAML contracts.")
    parser.add_argument("--ui", required=True, type=Path, help="Path to ui-schema.yaml")
    parser.add_argument("--api", required=True, type=Path, help="Path to api-schema.yaml")
    parser.add_argument("--mapping", required=True, type=Path, help="Path to mapping-logic.yaml")
    parser.add_argument("--out-dir", required=True, type=Path, help="Output design-spec/<component> directory")
    parser.add_argument("--capability", help="OpenSpec capability name. Defaults to kebab-case UI component name.")
    args = parser.parse_args()

    try:
        ui_doc = load_yaml(args.ui)
        api_doc = load_yaml(args.api)
        mapping_doc = load_yaml(args.mapping)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    ui = ui_doc.get("ui", {})
    api = api_doc.get("api", {})
    mapping = mapping_doc.get("mapping", {})
    if not isinstance(ui, dict) or not isinstance(api, dict) or not isinstance(mapping, dict):
        print("contracts must contain ui, api, and mapping objects", file=sys.stderr)
        return 1

    capability = args.capability or kebab_case(str(ui.get("name") or mapping.get("component") or "component"))
    copy_contracts(args.ui, args.api, args.mapping, args.out_dir)
    write_text(args.out_dir / "notes.md", generate_notes(ui, api, mapping, capability))
    write_text(args.out_dir / "data-fetching.md", generate_data_fetching(ui, api, mapping))
    write_text(args.out_dir / "specs" / capability / "spec.md", generate_spec(ui, api, mapping, capability))

    print(f"OK: generated design spec at {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
