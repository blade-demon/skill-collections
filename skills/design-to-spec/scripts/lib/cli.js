export function parseArgs(argv, spec) {
  const result = {};
  const positional = [];
  const flags = new Set(spec.flags ?? []);
  const opts = new Set(spec.options ?? []);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (flags.has(name)) {
        result[name] = true;
      } else if (opts.has(name)) {
        const value = argv[++i];
        if (value === undefined) {
          throw new Error(`missing value for --${name}`);
        }
        result[name] = value;
      } else {
        throw new Error(`unknown argument --${name}`);
      }
    } else {
      positional.push(arg);
    }
  }
  result._ = positional;
  return result;
}

export function requireOpts(args, names) {
  const missing = names.filter((n) => args[n] === undefined);
  if (missing.length > 0) {
    throw new Error(`missing required options: ${missing.map((n) => '--' + n).join(', ')}`);
  }
}
