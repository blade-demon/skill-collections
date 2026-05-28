import { describe, expect, it } from 'vitest';

import { stableJson } from '../../utils/stable-json';
import { runContract } from '../run-contract';
import { deriveComponentPlan } from '../derive-component-plan';
import { bridgedFullChat, makeButtonyView } from './fixtures';
import { interactiveInput, presentationalInput } from './component-plan-fixtures';

const APPROVAL = {
  reason: 'visual delivery first; interaction deferred',
  approvedBy: 'alice',
  approvedAt: '2026-05-26T00:00:00Z',
} as const;

describe('runContract — full-chain (derive everything from designIr)', () => {
  it('presentational + deferred derives all four artifacts', () => {
    const { designIr } = bridgedFullChat();
    const result = runContract({
      designIr,
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: APPROVAL,
    });

    expect(result.visualView.kind).toBe('visual-view');
    expect(result.semanticView.kind).toBe('semantic-view');
    expect(result.interactionSpec.status).toBe('deferred');
    expect(result.componentPlan.kind).toBe('component-plan');
    expect(result.componentPlan.mode).toBe('presentational');
    expect(result.componentPlan.status).toBe('draft');
  });

  it('internal hash chain is self-consistent across the derived artifacts', () => {
    const { designIr } = bridgedFullChat();
    const { visualView, semanticView, interactionSpec, componentPlan } = runContract({
      designIr,
      mode: 'presentational',
      interactionMode: 'omitted',
      approval: APPROVAL,
    });
    const irHash = visualView.generatedFrom.designIrHash;
    expect(semanticView.generatedFrom.designIrHash).toBe(irHash);
    expect(interactionSpec.generatedFrom.designIrHash).toBe(irHash);
    expect(componentPlan.generatedFrom.designIrHash).toBe(irHash);
    expect(componentPlan.generatedFrom.interactionSpecHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('runContract — interactive path (never auto-approves)', () => {
  it('succeeds only when a caller-provided interactionSpec is already approved', () => {
    const fx = interactiveInput();
    const result = runContract({
      designIr: fx.designIr,
      visualView: fx.visualView,
      semanticView: fx.semanticView,
      interactionSpec: fx.interactionSpec,
      mode: 'interactive',
    });
    expect(result.componentPlan.mode).toBe('interactive');
    expect(result.interactionSpec.status).toBe('approved');
    /* provided spec used as-is, not re-derived. */
    expect(result.interactionSpec).toBe(fx.interactionSpec);
  });

  it('throws when mode=interactive derives a draft spec (status not eligible)', () => {
    const { designIr } = makeButtonyView();
    expect(() =>
      runContract({ designIr, mode: 'interactive', interactionMode: 'draft' }),
    ).toThrowError(/status 'draft' is not eligible/);
  });

  it('throws when mode=interactive derives an omitted spec (requires approved)', () => {
    const { designIr } = makeButtonyView();
    expect(() =>
      runContract({
        designIr,
        mode: 'interactive',
        interactionMode: 'omitted',
        approval: APPROVAL,
      }),
    ).toThrowError(/mode='interactive' requires interaction-spec status='approved'/);
  });
});

describe('runContract — resume from a provided prefix', () => {
  it('reuses provided visualView + semanticView verbatim and derives only downstream', () => {
    const fx = presentationalInput();
    const result = runContract({
      designIr: fx.designIr,
      visualView: fx.visualView,
      semanticView: fx.semanticView,
      mode: 'presentational',
      interactionMode: 'deferred',
      approval: APPROVAL,
    });
    /* Reference equality proves the provided views were not re-derived. */
    expect(result.visualView).toBe(fx.visualView);
    expect(result.semanticView).toBe(fx.semanticView);
    expect(result.interactionSpec.status).toBe('deferred');
    expect(result.componentPlan.kind).toBe('component-plan');
  });
});

describe('runContract — provided views must pass hash-chain validation', () => {
  it('throws on a provided visualView with a mismatched designIrHash', () => {
    const fx = presentationalInput();
    const badVisual = {
      ...fx.visualView,
      generatedFrom: { ...fx.visualView.generatedFrom, designIrHash: 'deadbeef' },
    };
    expect(() =>
      runContract({
        designIr: fx.designIr,
        visualView: badVisual,
        mode: 'presentational',
        interactionMode: 'deferred',
        approval: APPROVAL,
      }),
    ).toThrowError(/provided visualView designIrHash mismatch/);
  });

  it('throws on a provided semanticView with a mismatched visualViewHash', () => {
    const fx = presentationalInput();
    const badSemantic = {
      ...fx.semanticView,
      generatedFrom: { ...fx.semanticView.generatedFrom, visualViewHash: 'feedface' },
    };
    expect(() =>
      runContract({
        designIr: fx.designIr,
        visualView: fx.visualView,
        semanticView: badSemantic,
        mode: 'presentational',
        interactionMode: 'deferred',
        approval: APPROVAL,
      }),
    ).toThrowError(/provided semanticView visualViewHash mismatch/);
  });

  it('throws on a provided interactionSpec with a mismatched semanticViewHash', () => {
    const fx = interactiveInput();
    const badInteraction = {
      ...fx.interactionSpec,
      generatedFrom: { ...fx.interactionSpec.generatedFrom, semanticViewHash: 'cafebabe' },
    };
    expect(() =>
      runContract({
        designIr: fx.designIr,
        visualView: fx.visualView,
        semanticView: fx.semanticView,
        interactionSpec: badInteraction,
        mode: 'interactive',
      }),
    ).toThrowError(/provided interactionSpec semanticViewHash mismatch/);
  });
});

describe('runContract — provided views must form a contiguous prefix', () => {
  it('throws when semanticView is provided without visualView', () => {
    const fx = presentationalInput();
    expect(() =>
      runContract({
        designIr: fx.designIr,
        semanticView: fx.semanticView,
        mode: 'presentational',
        interactionMode: 'deferred',
        approval: APPROVAL,
      }),
    ).toThrowError(/semanticView provided without visualView/);
  });

  it('throws when interactionSpec is provided without semanticView', () => {
    const fx = interactiveInput();
    expect(() =>
      runContract({
        designIr: fx.designIr,
        visualView: fx.visualView,
        interactionSpec: fx.interactionSpec,
        mode: 'interactive',
      }),
    ).toThrowError(/interactionSpec provided without semanticView/);
  });

  it('throws when a provided interactionSpec is combined with interactionMode/approval', () => {
    const fx = interactiveInput();
    expect(() =>
      runContract({
        designIr: fx.designIr,
        visualView: fx.visualView,
        semanticView: fx.semanticView,
        interactionSpec: fx.interactionSpec,
        mode: 'interactive',
        interactionMode: 'draft',
      }),
    ).toThrowError(/mutually exclusive/);
  });

  it('throws when interactionMode is omitted while deriving the interaction spec (no implicit draft)', () => {
    /* §2.1 constraint 3: runContract must not silently default to draft when
     * it has to derive the interaction spec — the caller has to say which
     * mode. Guards against a hidden default policy leaking in via
     * deriveInteractionSpec's own 'draft' fallback. */
    const { designIr } = bridgedFullChat();
    expect(() => runContract({ designIr, mode: 'presentational' })).toThrowError(
      /interactionMode is required when interactionSpec is not provided/,
    );
  });
});

describe('runContract — determinism + warnings merge', () => {
  it('produces byte-identical artifacts across runs for the same input', () => {
    const { designIr } = bridgedFullChat();
    const run = () =>
      runContract({
        designIr,
        mode: 'presentational',
        interactionMode: 'deferred',
        approval: APPROVAL,
      });
    const a = run();
    const b = run();
    expect(stableJson(a.visualView)).toBe(stableJson(b.visualView));
    expect(stableJson(a.semanticView)).toBe(stableJson(b.semanticView));
    expect(stableJson(a.interactionSpec)).toBe(stableJson(b.interactionSpec));
    expect(stableJson(a.componentPlan)).toBe(stableJson(b.componentPlan));
    expect(a.warnings).toEqual(b.warnings);
  });

  it('an all-provided prefix contributes only the component-plan step warnings', () => {
    const fx = interactiveInput();
    const result = runContract({
      designIr: fx.designIr,
      visualView: fx.visualView,
      semanticView: fx.semanticView,
      interactionSpec: fx.interactionSpec,
      mode: 'interactive',
    });
    /* Only deriveComponentPlan ran (the other three were provided), so the
     * merged warnings equal exactly that step's warnings. */
    const componentOnly = deriveComponentPlan({
      designIr: fx.designIr,
      visualView: fx.visualView,
      semanticView: fx.semanticView,
      interactionSpec: fx.interactionSpec,
      mode: 'interactive',
    });
    expect(result.warnings).toEqual(componentOnly.warnings);
  });
});
