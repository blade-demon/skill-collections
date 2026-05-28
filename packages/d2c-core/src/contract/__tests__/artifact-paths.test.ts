import { describe, expect, it } from 'vitest';

import { stableJson, stableSha256 } from '../../utils/stable-json';
import { ARTIFACT_FILENAMES, MANIFEST_FILENAME, buildContractManifest } from '../artifact-paths';
import { runContract, type RunContractInput } from '../run-contract';
import { bridgedFullChat } from './fixtures';
import { interactiveInput } from './component-plan-fixtures';

const APPROVAL = {
  reason: 'visual delivery first; interaction deferred',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

describe('ARTIFACT_FILENAMES + MANIFEST_FILENAME', () => {
  it('are the stable expected names', () => {
    expect(ARTIFACT_FILENAMES).toEqual({
      designIr: 'design-ir.json',
      visualView: 'visual-view.json',
      semanticView: 'semantic-view.json',
      interactionSpec: 'interaction-spec.json',
      componentPlan: 'component-plan.json',
    });
    expect(MANIFEST_FILENAME).toBe('manifest.json');
  });
});

describe('buildContractManifest', () => {
  it('covers the four contract artifacts in chain order (design-ir.json excluded)', () => {
    const { designIr } = bridgedFullChat();
    const input: RunContractInput = {
      designIr,
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: APPROVAL,
    };
    const result = runContract(input);
    const manifest = buildContractManifest(input, result);

    expect(manifest.artifacts.map((a) => a.filename)).toEqual([
      'visual-view.json',
      'semantic-view.json',
      'interaction-spec.json',
      'component-plan.json',
    ]);
    expect(manifest.artifacts.some((a) => a.filename === 'design-ir.json')).toBe(false);
  });

  it('hashes each entry as stableSha256(stableJson(artifact)) and carries generatedFrom verbatim', () => {
    const { designIr } = bridgedFullChat();
    const input: RunContractInput = {
      designIr,
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: APPROVAL,
    };
    const result = runContract(input);
    const manifest = buildContractManifest(input, result);

    const byName = Object.fromEntries(manifest.artifacts.map((a) => [a.filename, a]));
    expect(byName['visual-view.json']!.hash).toBe(stableSha256(stableJson(result.visualView)));
    expect(byName['component-plan.json']!.hash).toBe(
      stableSha256(stableJson(result.componentPlan)),
    );
    expect(byName['component-plan.json']!.generatedFrom).toEqual(
      result.componentPlan.generatedFrom,
    );
  });

  it('is deterministic — same input produces a byte-identical manifest', () => {
    const { designIr } = bridgedFullChat();
    const input: RunContractInput = {
      designIr,
      mode: 'presentational',
      interactionMode: 'omitted',
      approval: APPROVAL,
    };
    const a = buildContractManifest(input, runContract(input));
    const b = buildContractManifest(input, runContract(input));
    expect(stableJson(a)).toBe(stableJson(b));
  });

  it('marks every artifact derived when the whole chain was derived from designIr', () => {
    const { designIr } = bridgedFullChat();
    const input: RunContractInput = {
      designIr,
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: APPROVAL,
    };
    const manifest = buildContractManifest(input, runContract(input));
    for (const entry of manifest.artifacts) {
      expect(entry.origin).toBe('derived');
    }
  });

  it('marks provided upstream views provided while componentPlan stays derived', () => {
    const fx = interactiveInput();
    const input: RunContractInput = {
      designIr: fx.designIr,
      visualView: fx.visualView,
      semanticView: fx.semanticView,
      interactionSpec: fx.interactionSpec,
      mode: 'interactive',
    };
    const manifest = buildContractManifest(input, runContract(input));
    const origin = Object.fromEntries(manifest.artifacts.map((a) => [a.filename, a.origin]));
    expect(origin['visual-view.json']).toBe('provided');
    expect(origin['semantic-view.json']).toBe('provided');
    expect(origin['interaction-spec.json']).toBe('provided');
    expect(origin['component-plan.json']).toBe('derived');
  });

  it('origin differs but hash is identical for the same view derived vs provided', () => {
    const { designIr } = bridgedFullChat();
    /* First derive everything. */
    const derivedInput: RunContractInput = {
      designIr,
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: APPROVAL,
    };
    const derived = runContract(derivedInput);
    const derivedManifest = buildContractManifest(derivedInput, derived);

    /* Now feed the derived views back as a provided contiguous prefix. */
    const providedInput: RunContractInput = {
      designIr,
      visualView: derived.visualView,
      semanticView: derived.semanticView,
      interactionSpec: derived.interactionSpec,
      mode: 'presentational',
    };
    const providedManifest = buildContractManifest(providedInput, runContract(providedInput));

    const dByName = Object.fromEntries(derivedManifest.artifacts.map((a) => [a.filename, a]));
    const pByName = Object.fromEntries(providedManifest.artifacts.map((a) => [a.filename, a]));
    for (const filename of ['visual-view.json', 'semantic-view.json', 'interaction-spec.json']) {
      expect(pByName[filename]!.hash).toBe(dByName[filename]!.hash); // same artifact, same hash
      expect(dByName[filename]!.origin).toBe('derived');
      expect(pByName[filename]!.origin).toBe('provided'); // provenance differs
    }
  });
});
