import { CoarseBatchResultSchema, ROLE_WORDS } from './types.js'
import type { ValidationResult } from './validate-signature.js'
import { ZodError } from 'zod'

export function validateCoarseBatchResult(
  raw: unknown,
  expectedBatch: string,
  expectedFilenames: string[],
): ValidationResult {
  const errors: string[] = []

  // Pre-validate coarse signatures for operators before Zod validation
  if (raw && typeof raw === 'object' && 'images' in raw && Array.isArray(raw.images)) {
    for (let i = 0; i < raw.images.length; i++) {
      const img = raw.images[i]
      if (img && typeof img === 'object' && 'coarse_signature' in img) {
        const sig = img.coarse_signature as Record<string, unknown>
        for (const slot of ['T', 'M', 'B'] as const) {
          if (slot in sig && Array.isArray(sig[slot])) {
            for (const role of sig[slot] as unknown[]) {
              if (typeof role === 'string' && /->|\+|\(|\)/.test(role)) {
                const filename = img.filename && typeof img.filename === 'string' ? img.filename : `image[${i}]`
                errors.push(`image "${filename}" coarse ${slot}: role "${role}" contains operators — coarse signatures must be flat role arrays only`)
              }
            }
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  let parsed: ReturnType<typeof CoarseBatchResultSchema.parse>
  try {
    parsed = CoarseBatchResultSchema.parse(raw)
  } catch (e) {
    if (e instanceof ZodError) {
      return { valid: false, errors: e.errors.map(err => `${err.path.join('.')}: ${err.message}`) }
    }
    return { valid: false, errors: [String(e)] }
  }

  if (parsed.batch !== expectedBatch) {
    errors.push(`batch id mismatch: expected "${expectedBatch}", got "${parsed.batch}"`)
  }

  if (parsed.images.length !== expectedFilenames.length) {
    errors.push(`image count mismatch: expected ${expectedFilenames.length}, got ${parsed.images.length}`)
  }

  const seenFilenames = new Set<string>()
  for (const img of parsed.images) {
    if (img.filename.includes('/') || img.filename.includes('\\')) {
      errors.push(`image "${img.filename}": filename must be basename only`)
    }
    if (!expectedFilenames.includes(img.filename)) {
      errors.push(`image "${img.filename}": not in expected filenames`)
    }
    if (seenFilenames.has(img.filename)) {
      errors.push(`image "${img.filename}": duplicate filename`)
    }
    seenFilenames.add(img.filename)

    for (const slot of ['T', 'M', 'B'] as const) {
      for (const role of img.coarse_signature[slot]) {
        if (!(ROLE_WORDS as readonly string[]).includes(role)) {
          errors.push(`image "${img.filename}" coarse ${slot}: unknown role word "${role}"`)
        }
      }
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
    const result = validateCoarseBatchResult(parsed, expectedBatch, expectedFiles)
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    if (!result.valid) process.exit(1)
  })
}
