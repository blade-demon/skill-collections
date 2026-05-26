import { describe, expect, it } from 'vitest';

import { deriveInteractionSpec } from '../derive-interaction';
import { bridgedFullChat, makeMixedTextMediaView } from './fixtures';

describe('deriveInteractionSpec — draft dataModel heuristic', () => {
  it('produces one dataModel per text/media node in makeMixedTextMediaView', () => {
    const { interactionSpec, warnings } = deriveInteractionSpec(makeMixedTextMediaView());

    /* 3 text + 2 media (with assetRef) → 5 dataModels. */
    expect(interactionSpec.body.dataModels).toHaveLength(5);

    const textModels = interactionSpec.body.dataModels.filter((d) =>
      d.evidenceMessage.startsWith('text node'),
    );
    expect(textModels).toHaveLength(3);
    for (const d of textModels) {
      expect(d.confidence).toBe('medium');
      expect(d.type).toBe('string');
    }

    const mediaModels = interactionSpec.body.dataModels.filter((d) =>
      d.evidenceMessage.startsWith('media node'),
    );
    expect(mediaModels).toHaveLength(2);
    for (const d of mediaModels) {
      expect(d.confidence).toBe('low');
      expect(d.type).toBe('string');
    }

    expect(warnings.filter((w) => w.code === 'interaction-draft-media-as-url')).toHaveLength(2);
  });

  it('skips icons (kind=icon) — no dataModel candidate emitted from them', () => {
    /* makeFullChatView has 3 messages with 24x24 avatar images (< 32px → icon
     * kind). Those must not appear as dataModels. */
    const { interactionSpec } = deriveInteractionSpec(bridgedFullChat());
    const iconAvatarsAsData = interactionSpec.body.dataModels.filter((d) =>
      /avatar/i.test(d.slotName),
    );
    expect(iconAvatarsAsData).toHaveLength(0);
  });

  it('coverage.dataBinding transitions from omitted to draft when slots are produced', () => {
    const { interactionSpec } = deriveInteractionSpec(makeMixedTextMediaView());
    expect(interactionSpec.body.coverage.dataBinding.status).toBe('draft');
  });
});
