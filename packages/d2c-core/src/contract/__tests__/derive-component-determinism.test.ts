import { describe, expect, it } from 'vitest';

import { stableJson, stableSha256 } from '../../utils/stable-json';
import { deriveComponentPlan } from '../derive-component-plan';
import {
  interactiveInput,
  makeNestedFoldableSymbolInstancesView,
  presentationalInput,
  rechainHashes,
} from './component-plan-fixtures';
import { bridgedFullChat } from './fixtures';

describe('deriveComponentPlan — determinism', () => {
  it('same input produces deep-equal output across multiple runs (presentational)', () => {
    const a = deriveComponentPlan(presentationalInput()).componentPlan;
    const b = deriveComponentPlan(presentationalInput()).componentPlan;
    expect(a).toEqual(b);
    expect(stableJson(a)).toBe(stableJson(b));
  });

  it('same input produces deep-equal output across multiple runs (interactive)', () => {
    const a = deriveComponentPlan(interactiveInput()).componentPlan;
    const b = deriveComponentPlan(interactiveInput()).componentPlan;
    expect(a).toEqual(b);
    expect(stableJson(a)).toBe(stableJson(b));
  });

  it('same input produces byte-identical stable JSON serialization', () => {
    const a = deriveComponentPlan(presentationalInput()).componentPlan;
    const aHash = stableSha256(stableJson(a));
    const b = deriveComponentPlan(presentationalInput()).componentPlan;
    const bHash = stableSha256(stableJson(b));
    expect(aHash).toBe(bHash);
  });

  it('planned component / export / layout / asset ids are stable across runs and prefixed correctly', () => {
    const { componentPlan } = deriveComponentPlan(presentationalInput(bridgedFullChat));
    for (const component of componentPlan.body.components) {
      expect(component.id).toMatch(/^pc_[0-9a-f]{12}$/);
    }
    for (const exported of componentPlan.body.exports) {
      expect(exported.id).toMatch(/^pe_[0-9a-f]{12}$/);
    }
    for (const layout of componentPlan.body.layoutPlan) {
      expect(layout.id).toMatch(/^pl_[0-9a-f]{12}$/);
    }
    for (const asset of componentPlan.body.assetPlan) {
      expect(asset.id).toMatch(/^pa_[0-9a-f]{12}$/);
    }
  });

  it('semantic candidate order shuffles do not change planned component ids', () => {
    const input = presentationalInput(bridgedFullChat);
    const candidates = input.semanticView.body.componentCandidates;
    if (candidates.length < 2) {
      throw new Error('fixture invariant: bridgedFullChat must expose ≥ 2 candidates');
    }
    const reversedCandidates = [...candidates].reverse();
    const shuffledInput = {
      ...input,
      semanticView: {
        ...input.semanticView,
        body: { ...input.semanticView.body, componentCandidates: reversedCandidates },
      },
    };
    /* Shuffled candidates change the semanticView's content hash, which
     * would otherwise break the upstream chain. Re-chain downstream hashes
     * so the chain still passes — this test is about derive's id stability,
     * not about chain checks. */
    const originalIds = new Set(
      deriveComponentPlan(input).componentPlan.body.components.map((c) => c.id),
    );
    const shuffledIds = new Set(
      deriveComponentPlan(rechainHashes(shuffledInput)).componentPlan.body.components.map(
        (c) => c.id,
      ),
    );
    expect(shuffledIds).toEqual(originalIds);
  });

  it('component reuse artifacts are stable and use deterministic id prefixes', () => {
    const input = presentationalInput(makeNestedFoldableSymbolInstancesView);
    const first = deriveComponentPlan(input).componentPlan.body;
    const second = deriveComponentPlan(input).componentPlan.body;

    expect(stableJson(first.componentDefinitions)).toBe(stableJson(second.componentDefinitions));
    expect(stableJson(first.componentInvocations)).toBe(stableJson(second.componentInvocations));
    expect(
      first.componentDefinitions?.every((definition) => /^cd_[0-9a-f]{12}$/.test(definition.id)),
    ).toBe(true);
    expect(
      first.componentInvocations?.every((invocation) => /^ci_[0-9a-f]{12}$/.test(invocation.id)),
    ).toBe(true);
  });
});
