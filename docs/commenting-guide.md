# 注释指南

本仓库的注释应帮助维护者快速理解契约与交接点，而不是装饰显而易见的代码。

## 适合写注释的地方

- 公共 package 导出与 barrel 文件。
- 数据形态发生变化的 parser、provider 与 IR 边界。
- 编码产品或工作流决策的校验规则。
- 形状刻意异常的测试 fixture。
- 容易被误当成任意文本的生成输出预期。

## 通常不该写注释的地方

- 简单的赋值、import 与直白的函数调用。
- 只是重复已选好名称的注释。
- 应放在文档或 changelog 里的长篇历史说明。
- 没有负责人、优先级或具体下一步的 TODO。

## 公共 API 注释

当预期有其他 package 或 skill 导入时，在导出的函数、类型与 namespace 上使用简短 JSDoc。

```ts
/**
 * Converts a provider-specific artifact into the stable D2C IR contract.
 */
export function normalizeArtifact(input: ProviderArtifact): DesignIr;
```

对 barrel 文件，优先用模块级注释说明应如何分组导入：

```ts
/**
 * Public D2C core entry point. Import from subpath barrels when a consumer only
 * needs one layer, such as `@skill-collections/d2c-core/ir`.
 */
```

## 行内注释

行内注释应解释分支为何存在，而不是复述语法在做什么。

```ts
// Preserve missing dimensions so visual review can distinguish unknown values
// from explicit zero-size layers.
const width = frame.width ?? null;
```

## 测试注释

当 fixture 数据刻意极简、畸形，或为命中特定边界而构造时，在测试中写注释。

```ts
// The symbol omits override metadata to prove the normalizer keeps the instance
// tree renderable when Sketch exports partial data.
```

## 维护规则

当注释与代码不一致时，应在同一次变更中更新或删除注释。过时注释比没有注释更误导下一位维护者。
