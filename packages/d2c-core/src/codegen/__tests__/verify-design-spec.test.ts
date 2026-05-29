import { describe, expect, it } from 'vitest';

import { buildContractManifest } from '../../contract/artifact-paths';
import { runContract, type RunContractInput } from '../../contract/run-contract';
import { bridgedFullChat } from '../../contract/__tests__/fixtures';
import { approveComponentPlan } from '../sign-off';
import { verifyDesignSpec } from '../verify-design-spec';

const APPROVAL = {
  reason: 'visual delivery first; interaction deferred',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

const SIGN_OFF = {
  approvedBy: 'alice',
  approvedAt: '2026-05-29T00:00:00Z',
  acknowledgedBehaviorStubbed: true,
} as const;

/**
 * A full presentational design-spec whose component-plan has been signed off,
 * with a manifest rebuilt to match the approved plan's hash.
 */
function scenario() {
  const { designIr } = bridgedFullChat();
  const input: RunContractInput = {
    designIr,
    mode: 'presentational',
    interactionMode: 'deferred',
    approval: APPROVAL,
  };
  const result = runContract(input);
  const componentPlan = approveComponentPlan(result.componentPlan, SIGN_OFF);
  const approvedResult = { ...result, componentPlan };
  const manifest = buildContractManifest(input, approvedResult);
  return {
    input,
    result,
    approvedResult,
    designIr,
    visualView: result.visualView,
    semanticView: result.semanticView,
    interactionSpec: result.interactionSpec,
    componentPlan,
    manifest,
  };
}

describe('verifyDesignSpec', () => {
  it('accepts a valid, approved design-spec and returns the typed bundle', () => {
    const s = scenario();

    const verified = verifyDesignSpec({
      designIr: s.designIr,
      visualView: s.visualView,
      semanticView: s.semanticView,
      interactionSpec: s.interactionSpec,
      componentPlan: s.componentPlan,
      manifest: s.manifest,
    });

    expect(verified.componentPlan.status).toBe('approved');
    expect(verified.visualView.kind).toBe('visual-view');
    expect(verified.semanticView.kind).toBe('semantic-view');
    expect(verified.componentPlan.kind).toBe('component-plan');
  });

  it("rejects a component-plan that is not 'approved'", () => {
    const s = scenario();
    // draft plan + a manifest that matches the draft (so hashes reconcile and
    // only the status gate should fire)
    const draftManifest = buildContractManifest(s.input, s.result);

    expect(() =>
      verifyDesignSpec({
        designIr: s.designIr,
        visualView: s.visualView,
        semanticView: s.semanticView,
        interactionSpec: s.interactionSpec,
        componentPlan: s.result.componentPlan,
        manifest: draftManifest,
      }),
    ).toThrow(/approved/i);
  });

  it('rejects a manifest hash that does not match the artifact on disk', () => {
    const s = scenario();
    const tampered = structuredClone(s.manifest);
    tampered.artifacts[0]!.hash = 'f'.repeat(64);

    expect(() =>
      verifyDesignSpec({
        designIr: s.designIr,
        visualView: s.visualView,
        semanticView: s.semanticView,
        interactionSpec: s.interactionSpec,
        componentPlan: s.componentPlan,
        manifest: tampered,
      }),
    ).toThrow(/hash mismatch/i);
  });

  it('rejects a broken generatedFrom hash chain (manifest reconciles, chain does not)', () => {
    const s = scenario();
    // tamper the interaction-spec's upstream link, then rebuild the manifest so
    // the per-artifact hash still reconciles — only the chain check should fire
    const brokenInteraction = {
      ...s.interactionSpec,
      generatedFrom: { ...s.interactionSpec.generatedFrom, semanticViewHash: 'f'.repeat(64) },
    };
    const manifest = buildContractManifest(s.input, {
      ...s.approvedResult,
      interactionSpec: brokenInteraction,
    });

    expect(() =>
      verifyDesignSpec({
        designIr: s.designIr,
        visualView: s.visualView,
        semanticView: s.semanticView,
        interactionSpec: brokenInteraction,
        componentPlan: s.componentPlan,
        manifest,
      }),
    ).toThrow(/chain/i);
  });

  it('rejects a missing interaction-spec', () => {
    const s = scenario();

    expect(() =>
      verifyDesignSpec({
        designIr: s.designIr,
        visualView: s.visualView,
        semanticView: s.semanticView,
        interactionSpec: undefined,
        componentPlan: s.componentPlan,
        manifest: s.manifest,
      }),
    ).toThrow(/interaction-spec.*required/i);
  });
});
