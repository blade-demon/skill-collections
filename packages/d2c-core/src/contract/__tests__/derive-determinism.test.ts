import { describe, expect, it } from 'vitest';

import { stableJson } from '../../utils/stable-json';
import { deriveInteractionSpec } from '../derive-interaction';
import { bridgedFullChat, makeButtonyView, makeMixedTextMediaView } from './fixtures';

describe('deriveInteractionSpec — determinism', () => {
  it('produces byte-identical output across 3 repeated runs (full chat fixture)', () => {
    const a = deriveInteractionSpec(bridgedFullChat()).interactionSpec;
    const b = deriveInteractionSpec(bridgedFullChat()).interactionSpec;
    const c = deriveInteractionSpec(bridgedFullChat()).interactionSpec;
    expect(stableJson(a)).toBe(stableJson(b));
    expect(stableJson(b)).toBe(stableJson(c));
  });

  it('produces stable event ids across 3 repeated runs of makeButtonyView', () => {
    const a = deriveInteractionSpec(makeButtonyView()).interactionSpec;
    const b = deriveInteractionSpec(makeButtonyView()).interactionSpec;
    const idsA = a.body.events.map((e) => e.id).sort();
    const idsB = b.body.events.map((e) => e.id).sort();
    expect(idsB).toEqual(idsA);
  });

  it('produces stable dataModel ids across 3 repeated runs of makeMixedTextMediaView', () => {
    const a = deriveInteractionSpec(makeMixedTextMediaView()).interactionSpec;
    const b = deriveInteractionSpec(makeMixedTextMediaView()).interactionSpec;
    const idsA = a.body.dataModels.map((d) => d.id).sort();
    const idsB = b.body.dataModels.map((d) => d.id).sort();
    expect(idsB).toEqual(idsA);
  });
});
