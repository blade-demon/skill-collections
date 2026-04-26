#!/usr/bin/env python3
"""Regression tests for richer real-world frontend contract shapes."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent


UI_CONTRACT = """\
ui:
  name: AdminOrdersTable
  components:
    - id: ordersTable
      parent_id: root
      type: Table
      semantic_type: data-table
      role: data_field
      label: Orders
      interactive: true
      confidence: identified
      repeat_source: data.orders[]
      notes: Paginated order table
    - id: statusFilter
      parent_id: ordersTable
      type: Custom
      semantic_type: dropdown-filter
      role: action
      label: Status
      interactive: true
      confidence: identified
      repeat_source: ""
      notes: Filters order status
  states:
    - id: loading
      trigger: ordersRequest.pending === true
      required: true
      source: policy
      confidence: inferred
      render_assertion: renders table-level loading rows
      scope: region
      scope_components: [ordersTable]
    - id: empty
      trigger: data.orders.length === 0
      required: true
      source: policy
      confidence: inferred
      render_assertion: renders table empty row
      scope: region
      scope_components: [ordersTable]
    - id: success
      trigger: data.orders.length > 0
      required: true
      source: visible
      confidence: identified
      render_assertion: renders ordersTable rows
      scope: component
      scope_components: [ordersTable]
    - id: error
      trigger: ordersRequest.error !== null
      required: true
      source: policy
      confidence: inferred
      render_assertion: renders table error row with retry button
      scope: region
      scope_components: [ordersTable]
  layout:
    structure: grid
    notes: Table fills available container width.
"""


API_CONTRACT = """\
api:
  endpoints:
    - id: searchOrders
      url: /api/admin/orders/search
      method: POST
      auth_required: true
      cache_key_fields: [status, cursor]
      pagination:
        type: cursor
        request_fields: [cursor, limit]
        response_fields: [data.nextCursor, data.hasMore]
      params:
        - name: cursor
          type: string
          required: false
          notes: Cursor from previous page
      request_body:
        - name: status
          type: string
          required: false
          nullable: true
          enums: [OPEN, CLOSED]
          notes: Status filter
      response_fields:
        - name: data.orders
          type: array
          item_type: object
          nullable: false
          enums: []
          notes: Orders shown in table
        - name: data.nextCursor
          type: string
          item_type: ""
          nullable: true
          enums: []
          notes: Cursor for next page
        - name: data.hasMore
          type: boolean
          item_type: ""
          nullable: false
          enums: []
          notes: Whether more orders exist
      error_shape:
        - code: RATE_LIMITED
          message_field: error.message
          retryable: true
          ui_state: error
          notes: User can retry later
  open_questions: []
"""


MAPPING_CONTRACT = """\
mapping:
  component: AdminOrdersTable
  data_fetching:
    requests:
      - id: ordersRequest
        trigger: statusFilter.onChange
        endpoint: searchOrders
        call_type: user_triggered
        loading_state: true
        depends_on: []
    cache_policy:
      strategy: query_cache
      key_fields: [status, cursor]
      ttl: 60s
      stale_behavior: keep_previous_data
    retry_policy:
      strategy: manual
      max_attempts: 2
      backoff: none
    concurrency_policy:
      abortable: true
      dedupe_key: orders-search
      stale_response: ignore
  bindings:
    - source_ui: statusFilter
      target_api: status
      direction: ui_to_api
    - source_api: data.orders
      target_ui: ordersTable
      direction: api_to_ui
      transform: none
  state_machine:
    - from: idle
      event: statusFilter.onChange
      to: loading
      render_assertion: renders table-level loading rows
    - from: loading
      event: data.orders.length > 0
      to: success
      render_assertion: renders ordersTable rows
    - from: loading
      event: data.orders.length === 0
      to: empty
      render_assertion: renders table empty row
    - from: loading
      event: error.code === "RATE_LIMITED"
      to: error
      render_assertion: renders table error row with retry button
  open_questions: []
"""


class ContractExtensionsTest(unittest.TestCase):
    def test_rich_frontend_contracts_validate_and_generate_policy_details(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            ui = tmp / "ui-schema.yaml"
            api = tmp / "api-schema.yaml"
            mapping = tmp / "mapping-logic.yaml"
            out_dir = tmp / "out"
            ui.write_text(UI_CONTRACT, encoding="utf-8")
            api.write_text(API_CONTRACT, encoding="utf-8")
            mapping.write_text(MAPPING_CONTRACT, encoding="utf-8")

            validate = subprocess.run(
                [
                    sys.executable,
                    str(SKILL_DIR / "scripts" / "validate-contracts.py"),
                    "--ui",
                    str(ui),
                    "--api",
                    str(api),
                    "--mapping",
                    str(mapping),
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(validate.returncode, 0, validate.stderr + validate.stdout)

            generate = subprocess.run(
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
            self.assertEqual(generate.returncode, 0, generate.stderr + generate.stdout)

            notes_text = (out_dir / "notes.md").read_text(encoding="utf-8")
            data_fetching_text = (out_dir / "data-fetching.md").read_text(encoding="utf-8")
            self.assertIn("dropdown-filter", notes_text)
            self.assertIn("scope_components", notes_text)
            self.assertIn("request_body", notes_text)
            self.assertIn("RATE_LIMITED", notes_text)
            self.assertIn("cursor", data_fetching_text)
            self.assertIn("query_cache", data_fetching_text)
            self.assertIn("abortable", data_fetching_text)

            output_validate = subprocess.run(
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
                    str(out_dir / "specs" / "admin-orders-table" / "spec.md"),
                ],
                text=True,
                capture_output=True,
            )
            self.assertEqual(output_validate.returncode, 0, output_validate.stderr + output_validate.stdout)


if __name__ == "__main__":
    unittest.main()
