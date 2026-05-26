import { describe, expect, it } from 'vitest';

import { deriveInteractionSpec } from '../derive-interaction';
import { bridgedFullChat, makeButtonyView, makeInputComposerView } from './fixtures';

describe('deriveInteractionSpec — draft event heuristic (button)', () => {
  it('produces a click event for each frame whose name matches /(button|btn|cta|submit|send)/i', () => {
    const { interactionSpec, warnings } = deriveInteractionSpec(makeButtonyView());

    const buttonEvents = interactionSpec.body.events.filter((e) => e.eventName.endsWith('Click'));
    /* makeButtonyView has 2 button-like frames: PrimaryButton + Send CTA. */
    expect(buttonEvents).toHaveLength(2);

    for (const e of buttonEvents) {
      expect(e.confidence).toBe('low');
      expect(e.payload).toEqual({});
    }

    expect(warnings.filter((w) => w.code === 'interaction-draft-button-from-name')).toHaveLength(2);
  });

  it('preserves internal capitalization through camelCase — PrimaryButton → primaryButtonClick / onPrimaryButtonClick', () => {
    /* Locks down the bug where camelCase('PrimaryButton') collapsed to
     * 'primarybutton' (lost internal capital), making the event name
     * 'primarybuttonClick' and the handler prop 'onPrimarybuttonClick'. */
    const { interactionSpec } = deriveInteractionSpec(makeButtonyView());
    const eventNames = interactionSpec.body.events.map((e) => e.eventName).sort();
    expect(eventNames).toContain('primaryButtonClick');

    const primaryEvent = interactionSpec.body.events.find(
      (e) => e.eventName === 'primaryButtonClick',
    );
    expect(primaryEvent).toBeDefined();
    expect(primaryEvent!.handlerProp).toBe('onPrimaryButtonClick');
  });

  it('normalizes non-alphanumeric separators in node names — "Send CTA" → sendCtaClick / onSendCtaClick', () => {
    const { interactionSpec } = deriveInteractionSpec(makeButtonyView());
    const sendCtaEvent = interactionSpec.body.events.find((e) => e.eventName === 'sendCtaClick');
    expect(sendCtaEvent).toBeDefined();
    expect(sendCtaEvent!.handlerProp).toBe('onSendCtaClick');
  });

  it('does NOT promote a text node literally named "Send" to an event (kind guard)', () => {
    /* makeButtonyView includes a text node whose content is 'Send'. text →
     * dataModel only; the name-regex branch is guarded by kind ∈ {region,
     * component} so the text node never crosses over. */
    const { interactionSpec } = deriveInteractionSpec(makeButtonyView());
    const textNodeIdSubstring = 'node-label-send';
    expect(interactionSpec.body.events.some((e) => e.source.includes(textNodeIdSubstring))).toBe(
      false,
    );
    /* But the same text node should appear as a dataModel candidate. */
    const slot = interactionSpec.body.dataModels.find((d) =>
      d.evidenceMessage.includes('Text-label-send'),
    );
    expect(slot).toBeDefined();
    expect(slot!.confidence).toBe('medium');
  });
});

describe('deriveInteractionSpec — draft event heuristic (input)', () => {
  it('produces a change event AND a value dataModel for input/search/composer names', () => {
    const { interactionSpec, warnings } = deriveInteractionSpec(makeInputComposerView());

    const changeEvents = interactionSpec.body.events.filter((e) => e.eventName.endsWith('Change'));
    expect(changeEvents).toHaveLength(1);
    expect(changeEvents[0]!.payload).toEqual({ value: 'string' });
    expect(changeEvents[0]!.confidence).toBe('low');

    const valueSlots = interactionSpec.body.dataModels.filter((d) =>
      d.evidenceMessage.includes('input/field/search/composer'),
    );
    expect(valueSlots).toHaveLength(1);
    expect(valueSlots[0]!.type).toBe('string');

    expect(warnings.filter((w) => w.code === 'interaction-draft-input-from-name')).toHaveLength(1);
  });
});

describe('deriveInteractionSpec — coverage reflects drafted events', () => {
  it('coverage.events transitions from omitted to draft when at least one event is produced', () => {
    /* full chat has a Component/InputComposer prefixed frame → name regex
     * input match → event candidate is produced. */
    const { interactionSpec } = deriveInteractionSpec(bridgedFullChat());
    expect(interactionSpec.body.coverage.events.status).toBe('draft');
  });
});

describe('deriveInteractionSpec — draft warnings persist on body.warnings', () => {
  it('writes heuristic warnings to both body.warnings and the return value', () => {
    /* Earlier this PR shipped body.warnings as a hardcoded [], so the
     * spec persisted to disk lost media-as-url and button/input-from-name
     * caveats. Both surfaces should now agree. */
    const { interactionSpec, warnings } = deriveInteractionSpec(makeButtonyView());

    expect(warnings.length).toBeGreaterThan(0);
    expect(interactionSpec.body.warnings).toHaveLength(warnings.length);
    expect(interactionSpec.body.warnings.map((w) => w.code).sort()).toEqual(
      warnings.map((w) => w.code).sort(),
    );
    expect(
      interactionSpec.body.warnings.some((w) => w.code === 'interaction-draft-button-from-name'),
    ).toBe(true);
  });
});
