/**
 * 组件骨架代码生成器的CLI入口。
 *
 * 该模块实现image-to-component工作流的核心代码生成阶段。
 * 从标准输入读取结构化配置，输出对应框架的组件骨架文件。
 *
 * 设计理念：
 * - 框架无关：支持React、Vue2、Vue3的统一配置输入
 * - 确定性输出：相同输入始终产生相同的代码文件
 * - 可测试：纯函数生成器 + CLI薄层，易于单元测试
 */
import { SkeletonConfigSchema } from './types.js';
import { generateReact } from './lib/skeleton/react.js';
import { generateVue3 } from './lib/skeleton/vue3.js';
import { generateVue2 } from './lib/skeleton/vue2.js';
import { ZodError } from 'zod';

/**
 * CLI主入口：仅在直接运行时执行，import时跳过。
 * 这种模式允许将生成逻辑复用于其他工具链。
 */
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

    /**
     * 框架分发：根据配置中的framework字段选择对应的生成器。
     * 每个生成器都遵循相同的输入输出契约，确保行为一致性。
     */
    let files;
    if (config.framework === 'react') files = generateReact(config);
    else if (config.framework === 'vue3') files = generateVue3(config);
    else files = generateVue2(config);

    process.stdout.write(JSON.stringify(files, null, 2) + '\n');
  });
}
