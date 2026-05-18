import { BatchResultSchema } from './types.js'
import { validateSlotExpr } from './lib/slot-parser.js'
import { ZodError } from 'zod'

export interface ValidationSuccess { valid: true }
export interface ValidationFailure { valid: false; errors: string[] }
export type ValidationResult = ValidationSuccess | ValidationFailure

export function validateBatchResult(
  raw: unknown,
  expectedBatch: string,
  expectedFilenames: string[],
): ValidationResult {
  const errors: string[] = []

  // Schema validation (catches forbidden notes keys via .strict())
  let parsed: ReturnType<typeof BatchResultSchema.parse>
  try {
    parsed = BatchResultSchema.parse(raw)
  } catch (e) {
    if (e instanceof ZodError) {
      return { valid: false, errors: e.errors.map(err => `${err.path.join('.')}: ${err.message}`) }
    }
    return { valid: false, errors: [String(e)] }
  }

  // Batch id match
  if (parsed.batch !== expectedBatch) {
    errors.push(`batch id mismatch: expected "${expectedBatch}", got "${parsed.batch}"`)
  }

  // Image count match
  if (parsed.images.length !== expectedFilenames.length) {
    errors.push(`image count mismatch: expected ${expectedFilenames.length}, got ${parsed.images.length}`)
  }

  const seenFilenames = new Set<string>()
  for (const img of parsed.images) {
    // Basename only
    if (img.filename.includes('/') || img.filename.includes('\\')) {
      errors.push(`image "${img.filename}": filename must be basename only (no directory path)`)
    }

    // Filename in expected set
    if (!expectedFilenames.includes(img.filename)) {
      errors.push(`image "${img.filename}": not in expected filenames [${expectedFilenames.join(', ')}]`)
    }

    // Duplicate check
    if (seenFilenames.has(img.filename)) {
      errors.push(`image "${img.filename}": duplicate filename`)
    }
    seenFilenames.add(img.filename)

    // Slot expression validation
    for (const slot of ['T', 'M', 'B', 'O', 'F'] as const) {
      const expr = img.signature[slot]
      const result = validateSlotExpr(expr)
      if (!result.valid) {
        errors.push(`image "${img.filename}" ${slot} slot: ${result.error}`)
      }
    }

    // Required note relationships
    if (img.signature.O !== '-' && !img.notes.overlay_type) {
      errors.push(`image "${img.filename}": O slot is not "-" but notes.overlay_type is missing or null`)
    }
    if (img.signature.F !== '-' && !img.notes.float_anchor) {
      errors.push(`image "${img.filename}": F slot is not "-" but notes.float_anchor is missing or null`)
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors }
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2)
  const batchIndex = args.indexOf('--batch')
  const expectedBatch = batchIndex >= 0 ? (args[batchIndex + 1] ?? '') : ''
  const filesIndex = args.indexOf('--expected-files')
  const expectedFiles = filesIndex >= 0 ? args.slice(filesIndex + 1).filter(a => !a.startsWith('--')) : []

  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => { raw += chunk })
  process.stdin.on('end', () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      process.stdout.write(JSON.stringify({ valid: false, errors: ['input is not valid JSON'] }) + '\n')
      process.exit(1)
    }
    const result = validateBatchResult(parsed, expectedBatch, expectedFiles)
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    if (!result.valid) process.exit(1)
  })
}
