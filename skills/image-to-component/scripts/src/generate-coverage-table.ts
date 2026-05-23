import { CoverageInputSchema, type CoverageInput } from './types.js';

export function generateCoverageTable(input: CoverageInput): string {
  const header = '| Signature path | Covering file(s) | Component(s) | Status |\n|---|---|---|---|';
  const rows = input.entries.map((e) => {
    const files = e.files.join(', ') || '—';
    const components = e.components.join(', ') || '—';
    return `| ${e.signaturePath} | ${files} | ${components} | ${e.status} |`;
  });

  const table = [header, ...rows].join('\n');

  const pendingNotes = input.entries
    .filter((e) => e.status === 'pending' && e.note)
    .map((e) => `- **${e.signaturePath}**: ${e.note}`);

  return pendingNotes.length > 0
    ? `${table}\n\n**Pending work:**\n${pendingNotes.join('\n')}`
    : table;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (process.argv[1] === new URL(import.meta.url).pathname) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      process.stderr.write('input is not valid JSON\n');
      process.exit(1);
    }
    const input = CoverageInputSchema.parse(parsed);
    process.stdout.write(generateCoverageTable(input) + '\n');
  });
}
