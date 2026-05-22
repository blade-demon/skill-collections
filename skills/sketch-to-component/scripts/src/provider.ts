import type { Provider } from '@skill-collections/d2c-core';
import { extractRaw, type SketchExtractInput } from './extract-raw.js';
import { normalizeParsedSketchRaw } from './normalize.js';

export const SketchProvider: Provider<SketchExtractInput> = {
  id: 'sketch',
  extractRaw,
  normalize: (raw) => normalizeParsedSketchRaw(raw),
};
