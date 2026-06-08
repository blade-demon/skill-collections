/**
 * 命令行参数解析器。
 *
 * 该函数为design-to-spec工具集提供统一的CLI接口。
 * 解决了"如何以类型安全的方式处理命令行参数"的问题。
 *
 * 设计目标：
 * - 支持标准的GNU风格长选项（--option）
 * - 区分标志（boolean）和选项（需要值）
 * - 提供清晰的错误消息而非神秘的解析失败
 * - 收集位置参数用于文件路径等用途
 */
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

/**
 * 必需选项验证器。
 *
 * 确保关键参数已提供，避免在后续处理中出现难以诊断的undefined错误。
 * 提供友好的错误消息指导用户正确使用命令。
 */
export function requireOpts(args, names) {
  const missing = names.filter((n) => args[n] === undefined);
  if (missing.length > 0) {
    throw new Error(`missing required options: ${missing.map((n) => '--' + n).join(', ')}`);
  }
}
