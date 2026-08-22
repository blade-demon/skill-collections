import { compareSignatures, type StructuralComparisonResult } from './lib/structural-comparison.js';
import { validateSlotExpr } from './lib/slot-parser.js';
import { StructuralComparisonInputSchema } from './types.js';

export type ComparisonCliResult =
  | { valid: true; result: StructuralComparisonResult }
  | { valid: false; errors: string[] };

const SLOT_NAMES = ['T', 'M', 'B', 'O', 'F'] as const;

export function compareBatchInput(raw: unknown): ComparisonCliResult {
  const parsed = StructuralComparisonInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.errors.map((error) => `${error.path.join('.')}: ${error.message}`),
    };
  }

  const errors: string[] = [];
  const images = [];
  const priorBatchFilenames = new Set<string>();

  for (const batch of parsed.data.batches) {
    const batchFilenames = new Set<string>();

    for (const image of batch.images) {
      if (priorBatchFilenames.has(image.filename)) {
        errors.push(`image "${image.filename}": duplicate filename across batches`);
      }

      for (const slot of SLOT_NAMES) {
        const result = validateSlotExpr(image.signature[slot]);
        if (!result.valid) {
          errors.push(`image "${image.filename}" ${slot} slot: ${result.error}`);
        }
      }

      batchFilenames.add(image.filename);
      images.push(image);
    }

    for (const filename of batchFilenames) {
      priorBatchFilenames.add(filename);
    }
  }

  if (images.length < 2) {
    errors.push('at least 2 images are required for comparison');
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, result: compareSignatures(images) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      process.stdout.write(
        JSON.stringify({ valid: false, errors: ['input is not valid JSON'] }, null, 2) + '\n',
      );
      process.exit(1);
    }

    const output = compareBatchInput(input);
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    if (!output.valid) process.exit(1);
  });
}
