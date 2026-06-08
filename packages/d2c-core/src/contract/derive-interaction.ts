/**
 * Stage 5B — `deriveInteractionSpec`.
 *
 * Pure function: `{ designIr, visualView, semanticView, mode?, approval? }`
 * → `{ interactionSpec, warnings }`. No file IO, no network, no clock.
 * Same input ⇒ byte-identical output (plan §2 determinism contract).
 *
 * Behavior matrix (per docs/stages/stage-5b-interaction-spec-plan.md):
 *
 *   §3.3 / §6.2 — hash chain: visual.designIrHash, semantic.designIrHash,
 *                 semantic.visualViewHash must all line up with the inputs;
 *                 otherwise throw (not warn).
 *   §6.3       — mode === 'omitted' or 'deferred' requires `approval`,
 *                 produces an empty events/states/dataModels/transitions body
 *                 with coverage aligned to the mode.
 *   §6.4       — body.components always populated 1-to-1 from
 *                 semanticView.body.componentCandidates (Stage 6 codegen
 *                 needs the list even in presentational mode).
 *   §6.5       — draft heuristic: text → dataModel(medium);
 *                 media + assetRef → dataModel(low);
 *                 icon → skip;
 *                 kind ∈ {region, component} AND name regex:
 *                   button|btn|cta|submit|send → event Click;
 *                   tab|tabs|tabbar             → event Select;
 *                   input|field|search|composer → event Change + dataModel;
 *                 first regex match wins (button > tab > input);
 *                 every candidate carries confidence ≤ medium (§3.4 ceiling).
 *   §6.6       — coverage matrix: draft mode leaves states + stateTransitions
 *                 'omitted' (no annotation extractor); events / dataBinding
 *                 are 'draft' when the bag is non-empty, else 'omitted'.
 *   §3.6       — deterministic ids reuse the stableSha256(stableJson(...))
 *                 scheme from 5A, with new ic_/ie_/id_ prefixes.
 *
 * On return the spec is parsed through InteractionSpecSchema and validated
 * via assertInteractionSpecIntegrity(spec, semanticNodeIds) so that any
 * dangling source / id collision / coverage-vs-status drift in the produced
 * body is caught here (derive bug, throws hard) rather than silently
 * propagating to Stage 6.
 */
import {
  type DesignIR,
  type SemanticView,
  type VisualNode,
  type VisualView,
  type Warning,
} from '../ir';
import { stableJson, stableSha256 } from '../utils/stable-json';

import {
  type InteractionComponent,
  type InteractionDataModel,
  type InteractionEvent,
  type InteractionSpec,
  type InteractionSpecBody,
  InteractionSpecSchema,
} from './interaction-schema';
import { assertInteractionSpecIntegrity } from './interaction-validate';

/* ── regex constants (§6.5) ──────────────────────────────────────────────── */

const BUTTON_RE = /(button|btn|cta|submit|send)/i;
const TAB_RE = /(tab|tabs|tabbar)/i;
const INPUT_RE = /(input|field|search|composer)/i;

/* ── public types ────────────────────────────────────────────────────────── */

export type DeriveInteractionMode = 'draft' | 'omitted' | 'deferred';

export interface DeriveInteractionSpecInput {
  designIr: DesignIR;
  visualView: VisualView;
  semanticView: SemanticView;
  mode?: DeriveInteractionMode;
  /** Required when mode is 'omitted' or 'deferred'. */
  approval?: {
    reason: string;
    approvedBy: string;
    approvedAt: string;
  };
}

export interface DeriveInteractionSpecResult {
  interactionSpec: InteractionSpec;
  warnings: Warning[];
}

/* ── entry ───────────────────────────────────────────────────────────────── */

export function deriveInteractionSpec(
  input: DeriveInteractionSpecInput,
): DeriveInteractionSpecResult {
  const mode: DeriveInteractionMode = input.mode ?? 'draft';

  /* mode/approval well-formedness */
  if (mode === 'omitted' || mode === 'deferred') {
    if (input.approval === undefined) {
      throw new Error(
        `deriveInteractionSpec: mode='${mode}' requires an approval object (reason / approvedBy / approvedAt)`,
      );
    }
  } else if (input.approval !== undefined) {
    throw new Error(
      `deriveInteractionSpec: mode='${mode}' must not carry an approval object — those are reserved for omitted/deferred (or for downstream approved transitions)`,
    );
  }

  /* §6.2 — hash chain validation */
  const computedIrHash = stableSha256(stableJson(input.designIr));
  if (input.visualView.generatedFrom.designIrHash !== computedIrHash) {
    throw new Error(
      `deriveInteractionSpec: visual-view designIrHash mismatch — expected ${computedIrHash}, got ${input.visualView.generatedFrom.designIrHash ?? '(absent)'}`,
    );
  }
  if (input.semanticView.generatedFrom.designIrHash !== computedIrHash) {
    throw new Error(
      `deriveInteractionSpec: semantic-view designIrHash mismatch — expected ${computedIrHash}, got ${input.semanticView.generatedFrom.designIrHash ?? '(absent)'}`,
    );
  }
  const computedVisualHash = stableSha256(stableJson(input.visualView));
  if (input.semanticView.generatedFrom.visualViewHash !== computedVisualHash) {
    throw new Error(
      `deriveInteractionSpec: semantic-view visualViewHash mismatch — expected ${computedVisualHash}, got ${input.semanticView.generatedFrom.visualViewHash ?? '(absent)'}`,
    );
  }

  /* §6.4 — components from semantic candidates (always, all 3 modes).
   * Stage 5A allows two candidates to share one rootSemanticNodeId (different
   * boundary discriminators → different cc_ ids; e.g. one parent that is both
   * a visual-region candidate AND hosts a promotable repeat-pattern). The
   * legacy id recipe `(semanticNodeId)` would collide here; instead, when a
   * root carries >1 candidate, fold the full candidate.id into the hash so
   * each InteractionComponent stays distinct. Single-candidate roots keep
   * the legacy recipe so existing fixtures/goldens are byte-stable. */
  const rootMultiplicity = new Map<string, number>();
  for (const c of input.semanticView.body.componentCandidates) {
    rootMultiplicity.set(
      c.rootSemanticNodeId,
      (rootMultiplicity.get(c.rootSemanticNodeId) ?? 0) + 1,
    );
  }
  const components: InteractionComponent[] = input.semanticView.body.componentCandidates.map(
    (candidate) => ({
      id:
        (rootMultiplicity.get(candidate.rootSemanticNodeId) ?? 0) > 1
          ? generateComponentIdFromCandidate(candidate.id)
          : generateComponentId(candidate.rootSemanticNodeId),
      semanticNodeId: candidate.rootSemanticNodeId,
      name: candidate.suggestedName,
      confidence: candidate.confidence,
    }),
  );

  let body: InteractionSpecBody;
  const warnings: Warning[] = [];

  if (mode === 'omitted' || mode === 'deferred') {
    /* §6.3 — empty behavior body with coverage pinned to the mode. */
    const reason = input.approval!.reason;
    body = {
      components,
      states: [],
      events: [],
      dataModels: [],
      stateTransitions: [],
      coverage: {
        states: { status: mode, notes: reason },
        events: { status: mode, notes: reason },
        dataBinding: { status: mode, notes: reason },
        stateTransitions: { status: mode, notes: reason },
      },
      warnings: [],
    };
  } else {
    /* §6.5 — draft mode heuristic. */
    const drafted = draftFromSemanticView(input.semanticView, input.visualView);
    warnings.push(...drafted.warnings);
    body = {
      components,
      states: [],
      events: drafted.events,
      dataModels: drafted.dataModels,
      stateTransitions: [],
      coverage: {
        states: {
          status: 'omitted',
          notes: 'draft mode: state machine requires annotations not yet wired',
        },
        events: {
          status: drafted.events.length > 0 ? 'draft' : 'omitted',
          notes: `${drafted.events.length} candidate events drafted`,
        },
        dataBinding: {
          status: drafted.dataModels.length > 0 ? 'draft' : 'omitted',
          notes: `${drafted.dataModels.length} candidate slots drafted`,
        },
        stateTransitions: {
          status: 'omitted',
          notes: 'draft mode: state transitions require an annotated state machine',
        },
      },
      /* Persist heuristic warnings inside the spec body. The same list is
       * also returned from this function (`warnings`), but downstream
       * consumers serialize body.warnings — review caveats like
       * `interaction-draft-media-as-url` must survive the round-trip. */
      warnings: drafted.warnings,
    };
  }

  /* §3.3 — write hash chain. semanticViewHash is fresh; the other two are
   * the values we already verified against. */
  const generatedFrom: InteractionSpec['generatedFrom'] = {
    schemaVersion: input.designIr.schemaVersion,
    designIrHash: computedIrHash,
    visualViewHash: computedVisualHash,
    semanticViewHash: stableSha256(stableJson(input.semanticView)),
  };
  if (input.visualView.generatedFrom.sourceRef !== undefined) {
    generatedFrom.sourceRef = input.visualView.generatedFrom.sourceRef;
  }

  /* Build the candidate spec object, then parse through the schema so the
   * returned value has been validated by the same surface external consumers
   * will run on it. */
  const specCandidate: Record<string, unknown> = {
    kind: 'interaction-spec',
    generatedFrom,
    status: mode,
    body,
  };
  if (mode === 'omitted' || mode === 'deferred') {
    specCandidate.reason = input.approval!.reason;
    specCandidate.approvedBy = input.approval!.approvedBy;
    specCandidate.approvedAt = input.approval!.approvedAt;
  }

  const parsed = InteractionSpecSchema.safeParse(specCandidate);
  if (!parsed.success) {
    throw new Error(
      `deriveInteractionSpec produced an InteractionSpec that fails InteractionSpecSchema: ${parsed.error.message}`,
    );
  }
  const spec = parsed.data;

  /* Artifact-chain self-check (plan §5.2). */
  const semanticNodeIds = new Set(input.semanticView.body.nodes.map((n) => n.id));
  assertInteractionSpecIntegrity(spec, semanticNodeIds);

  return { interactionSpec: spec, warnings };
}

/* ── draft heuristic (§6.5) ──────────────────────────────────────────────── */

interface DraftBucket {
  events: InteractionEvent[];
  dataModels: InteractionDataModel[];
  warnings: Warning[];
}

function draftFromSemanticView(semanticView: SemanticView, visualView: VisualView): DraftBucket {
  const visualNodeById = buildVisualNodeIndex(visualView.body.root);

  const events: InteractionEvent[] = [];
  const dataModels: InteractionDataModel[] = [];
  const warnings: Warning[] = [];

  for (const node of semanticView.body.nodes) {
    /* Mutually exclusive branches, in priority order. */
    if (node.kind === 'text') {
      dataModels.push(makeTextDataModel(node.id, node.name));
      continue;
    }

    if (node.kind === 'media') {
      const visual = visualNodeById.get(node.primaryVisualNodeId);
      if (visual !== undefined && visual.assetRef !== undefined) {
        dataModels.push(makeMediaDataModel(node.id, node.name));
        warnings.push({
          code: 'interaction-draft-media-as-url',
          message: `node ${node.id}: media asset drafted as 'string' URL — verify before signoff`,
          severity: 'info',
          sourceNodeId: node.id,
        });
      }
      continue;
    }

    if (node.kind === 'icon') {
      /* §6.5 — icons are decoration in 5B, no data slot. */
      continue;
    }

    if (node.kind === 'region' || node.kind === 'component') {
      const buttonMatch = BUTTON_RE.exec(node.name);
      if (buttonMatch !== null) {
        events.push(makeClickEvent(node.id, node.name, buttonMatch[0]));
        warnings.push({
          code: 'interaction-draft-button-from-name',
          message: `node ${node.id}: name '${node.name}' matches /${BUTTON_RE.source}/i — drafted as click event (low confidence)`,
          severity: 'info',
          sourceNodeId: node.id,
        });
        continue;
      }
      const tabMatch = TAB_RE.exec(node.name);
      if (tabMatch !== null) {
        events.push(makeSelectEvent(node.id, node.name, tabMatch[0]));
        warnings.push({
          code: 'interaction-draft-tab-from-name',
          message: `node ${node.id}: name '${node.name}' matches /${TAB_RE.source}/i — drafted as select event (low confidence)`,
          severity: 'info',
          sourceNodeId: node.id,
        });
        continue;
      }
      const inputMatch = INPUT_RE.exec(node.name);
      if (inputMatch !== null) {
        events.push(makeChangeEvent(node.id, node.name, inputMatch[0]));
        dataModels.push(makeInputDataModel(node.id, node.name));
        warnings.push({
          code: 'interaction-draft-input-from-name',
          message: `node ${node.id}: name '${node.name}' matches /${INPUT_RE.source}/i — drafted as change event + value slot (low confidence)`,
          severity: 'info',
          sourceNodeId: node.id,
        });
        continue;
      }
    }
    /* otherwise: no candidate; node only participates as a component (if it
     * is a candidate root) or as background structure. */
  }

  return { events, dataModels, warnings };
}

function makeTextDataModel(sourceId: string, name: string): InteractionDataModel {
  const slotName = camelCase(name);
  return {
    id: generateDataModelId(sourceId, slotName),
    slotName,
    source: sourceId,
    type: 'string',
    confidence: 'medium',
    evidenceMessage: `text node '${name}'`,
  };
}

function makeMediaDataModel(sourceId: string, name: string): InteractionDataModel {
  const slotName = camelCase(name);
  return {
    id: generateDataModelId(sourceId, slotName),
    slotName,
    source: sourceId,
    type: 'string',
    confidence: 'low',
    evidenceMessage: `media node '${name}' with assetRef — drafted as URL string`,
  };
}

function makeInputDataModel(sourceId: string, name: string): InteractionDataModel {
  const slotName = camelCase(name);
  return {
    id: generateDataModelId(sourceId, slotName),
    slotName,
    source: sourceId,
    type: 'string',
    confidence: 'low',
    evidenceMessage: `input/field/search/composer name '${name}' — drafted as bound value slot`,
  };
}

function makeClickEvent(sourceId: string, name: string, matched: string): InteractionEvent {
  const eventName = camelCase(name) + 'Click';
  return {
    id: generateEventId(sourceId, eventName),
    eventName,
    source: sourceId,
    handlerProp: handlerPropFor(eventName),
    payload: {},
    confidence: 'low',
    evidenceMessage: `name '${name}' matches /${BUTTON_RE.source}/i (token '${matched}'), kind ∈ {region, component}`,
  };
}

function makeSelectEvent(sourceId: string, name: string, matched: string): InteractionEvent {
  const eventName = camelCase(name) + 'Select';
  return {
    id: generateEventId(sourceId, eventName),
    eventName,
    source: sourceId,
    handlerProp: handlerPropFor(eventName),
    payload: {},
    confidence: 'low',
    evidenceMessage: `name '${name}' matches /${TAB_RE.source}/i (token '${matched}'), kind ∈ {region, component}`,
  };
}

function makeChangeEvent(sourceId: string, name: string, matched: string): InteractionEvent {
  const eventName = camelCase(name) + 'Change';
  return {
    id: generateEventId(sourceId, eventName),
    eventName,
    source: sourceId,
    handlerProp: handlerPropFor(eventName),
    payload: { value: 'string' },
    confidence: 'low',
    evidenceMessage: `name '${name}' matches /${INPUT_RE.source}/i (token '${matched}'), kind ∈ {region, component}`,
  };
}

/**
 * Build a React-style handler prop from an already-camelCased event name.
 * NOTE: we cannot call pascalCase(eventName) here — the eventName has
 * already been camelCased once, and pascalCase splits on non-alphanumeric
 * then lowercases each subsequent part. Running it again would flatten
 * `primaryButtonClick` to `Primarybuttonclick`. Just upper-case the first
 * letter of the existing eventName.
 */
function handlerPropFor(eventName: string): string {
  if (eventName.length === 0) return 'onUnnamed';
  return 'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function buildVisualNodeIndex(root: VisualNode): Map<string, VisualNode> {
  const out = new Map<string, VisualNode>();
  const walk = (n: VisualNode): void => {
    out.set(n.id, n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/**
 * Convert an arbitrary identifier-ish string into camelCase. Splits on
 * non-alphanumeric runs AND on lowercase→uppercase boundaries, so PascalCase
 * input is preserved:
 *
 *   "Send Button"   → "sendButton"
 *   "PrimaryButton" → "primaryButton"  ← the bug-fixing case
 *   "send-cta"      → "sendCta"
 *   "HeroImage"     → "heroImage"
 *
 * Acronyms (consecutive capitals) are NOT specially handled — "XMLParser"
 * becomes "xmlparser" — but 5B fixtures avoid that shape. Falls back to
 * 'unnamed' for empty/symbol-only input.
 */
export function camelCase(input: string): string {
  const parts = splitIdentifier(input);
  if (parts.length === 0) return 'unnamed';
  const [first, ...rest] = parts;
  return (
    first!.toLowerCase() +
    rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('')
  );
}

export function pascalCase(input: string): string {
  const c = camelCase(input);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/**
 * Split an identifier on (a) non-alphanumeric runs and then (b) on
 * lowercase→uppercase boundaries. Step (b) is what makes camelCase work
 * for PascalCase input without losing internal capitalization.
 *
 * Implementation uses regex extraction instead of a sentinel-character
 * split: an earlier iteration of this helper accidentally embedded
 * literal NUL bytes into the source via the editor tooling, which made
 * the .ts file get classified as binary by some scanners. Extracting
 * tokens with `match()` keeps the source plain ASCII and is easier to
 * read besides.
 */
function splitIdentifier(input: string): string[] {
  const parts: string[] = [];
  for (const segment of input.split(/[^a-zA-Z0-9]+/)) {
    if (segment.length === 0) continue;
    /* Each token is either a run of uppercase letters optionally followed
     * by lowercase/digits (e.g. "Primary", "Button", "CTA") or a pure
     * lowercase/digit run (e.g. "send", "cta"). Consecutive capitals stick
     * together as one token — "XMLParser" → ["XMLParser"], which is a
     * known 5B limitation documented on camelCase. */
    const tokens = segment.match(/[A-Z]+[a-z0-9]*|[a-z0-9]+/g);
    if (tokens !== null) parts.push(...tokens);
  }
  return parts;
}

/* ── id generation (plan §3.6) ───────────────────────────────────────────── */

function generateComponentId(semanticNodeId: string): string {
  return 'ic_' + hashRecord({ form: 'interaction-component', semanticNodeId });
}

/** Disambiguating recipe for the rare case where a single rootSemanticNodeId
 * carries two ComponentCandidates (different boundary discriminator on the
 * Stage 5A side; cf. derive.ts §6.5/§6.6). */
function generateComponentIdFromCandidate(candidateId: string): string {
  return 'ic_' + hashRecord({ form: 'interaction-component', candidateId });
}

function generateEventId(sourceSemanticNodeId: string, eventName: string): string {
  return 'ie_' + hashRecord({ form: 'interaction-event', source: sourceSemanticNodeId, eventName });
}

function generateDataModelId(sourceSemanticNodeId: string, slotName: string): string {
  return 'id_' + hashRecord({ form: 'interaction-data', source: sourceSemanticNodeId, slotName });
}

function hashRecord(input: Record<string, unknown>): string {
  return stableSha256(stableJson(input)).slice(0, 12);
}
