import { SkeletonConfigSchema } from './types.js';
import { generateReact } from './lib/skeleton/react.js';
import { generateVue3 } from './lib/skeleton/vue3.js';
import { generateVue2 } from './lib/skeleton/vue2.js';
import { ZodError } from 'zod';

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

    let config: ReturnType<typeof SkeletonConfigSchema.parse>;
    try {
      config = SkeletonConfigSchema.parse(parsed);
    } catch (e) {
      if (e instanceof ZodError) {
        process.stderr.write(
          'Config validation error:\n' +
            e.errors.map((err) => `  ${err.path.join('.')}: ${err.message}`).join('\n') +
            '\n',
        );
      }
      process.exit(1);
      return;
    }

    let files;
    if (config.framework === 'react') files = generateReact(config);
    else if (config.framework === 'vue3') files = generateVue3(config);
    else files = generateVue2(config);

    process.stdout.write(JSON.stringify(files, null, 2) + '\n');
  });
}
