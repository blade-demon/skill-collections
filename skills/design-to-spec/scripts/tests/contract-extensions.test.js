import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeTmpDir, runNodeScript } from "./helpers.js";

const UI_CONTRACT = `\
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
`;

const API_CONTRACT = `\
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
`;

const MAPPING_CONTRACT = `\
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
`;

test("rich frontend contracts validate and generate policy details", () => {
  const tmp = makeTmpDir();
  const ui = resolve(tmp, "ui-schema.yaml");
  const api = resolve(tmp, "api-schema.yaml");
  const mapping = resolve(tmp, "mapping-logic.yaml");
  const outDir = resolve(tmp, "out");

  writeFileSync(ui, UI_CONTRACT, "utf8");
  writeFileSync(api, API_CONTRACT, "utf8");
  writeFileSync(mapping, MAPPING_CONTRACT, "utf8");

  const validate = runNodeScript("validate-contracts.js", [
    "--ui",
    ui,
    "--api",
    api,
    "--mapping",
    mapping,
  ]);
  assert.equal(validate.status, 0, validate.stderr + validate.stdout);

  const generate = runNodeScript("generate-output.js", [
    "--ui",
    ui,
    "--api",
    api,
    "--mapping",
    mapping,
    "--out-dir",
    outDir,
  ]);
  assert.equal(generate.status, 0, generate.stderr + generate.stdout);

  const notesText = readFileSync(resolve(outDir, "notes.md"), "utf8");
  const dataFetchingText = readFileSync(resolve(outDir, "data-fetching.md"), "utf8");
  assert.ok(notesText.includes("dropdown-filter"));
  assert.ok(notesText.includes("scope_components"));
  assert.ok(notesText.includes("request_body"));
  assert.ok(notesText.includes("RATE_LIMITED"));
  assert.ok(dataFetchingText.includes("cursor"));
  assert.ok(dataFetchingText.includes("query_cache"));
  assert.ok(dataFetchingText.includes("abortable"));

  const outputValidate = runNodeScript("validate-output.js", [
    "--strict",
    "--ui",
    resolve(outDir, "contracts", "ui-schema.yaml"),
    "--api",
    resolve(outDir, "contracts", "api-schema.yaml"),
    "--mapping",
    resolve(outDir, "contracts", "mapping-logic.yaml"),
    "--notes",
    resolve(outDir, "notes.md"),
    "--data-fetching",
    resolve(outDir, "data-fetching.md"),
    "--spec",
    resolve(outDir, "specs", "admin-orders-table", "spec.md"),
  ]);
  assert.equal(outputValidate.status, 0, outputValidate.stderr + outputValidate.stdout);
});
