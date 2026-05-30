# 阶段 5 — 埋点设计文档（搁置中）

**状态**: frozen，待主线功能完善后恢复
**决策日期**: 2026-05-01
**决策人**: 徐紫微
**预估工时**: 约 24.5h（≈3 工作日）

---

## 为什么先记下来再搁置

阶段五（埋点设计）是一项独立的功能扩展。当前优先级是先把已迁移到 Node.js 的核心链路在真实项目里跑通、磨平边缘 bug，再回来动这块。本文件捕获了完整的设计决策，确保未来任何人（包括将来的我们自己）能直接照着实施而不用重走对齐流程。

---

## 已经定下来的关键决策

| 决策             | 选择                                           | 否决理由                                                                                                                           |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 是否独立阶段     | **方案 A：独立第 5 阶段 + 独立 YAML 契约**     | 否决 B（扩展 Mapping_Logic）：埋点服务的是 PM/数据/增长团队，独立确认门 + 独立校验更对称；和 i18n / 性能预算等未来扩展同一架构模式 |
| 平台扩展策略     | **契约 platform-agnostic + 输出 adapter 插件** | 不硬编码任何 SDK；新增平台只需加一个 adapter 文件                                                                                  |
| 首期 adapter     | `internal-sdk` + `generic`（兜底）             | 后续按需增加 `sensors` / `ga4` / `mixpanel`                                                                                        |
| 早退闸门         | 阶段 5 入口先问 yes/no/later                   | 纯展示组件零成本跳过，避免仪式感                                                                                                   |
| 事件触发引用方式 | 复用现有 trace 锚点（binding/state/component） | 不重复定义事实，跨契约可机器校验                                                                                                   |

---

## 已知的内部 SDK 信息（待补完）

**调用签名**：

```js
trackEvent('', {});
```

即 `trackEvent(eventName: string, properties: object)` 形式。这是 `internal-sdk` adapter 的 `renderEventSnippet` 出口模板：

```ts
// internal-sdk adapter renderEventSnippet 输出
trackEvent('search_submit', {
  user_id: global.user.id,
  page_id: route.name,
  keyword: searchInput.value,
});
```

**恢复实施前需向用户补齐的信息**：

- [ ] SDK 是全局函数 `trackEvent(...)` 还是模块导入 `import { trackEvent } from '@xxx/tracker'`？
- [ ] 强制注入属性（除了 user_id / device_id / session_id / ts 还有什么）？
- [ ] 事件名约束（最大长度、字符集、是否区分大小写）
- [ ] 属性值上限（单事件属性数 / 字符串长度）
- [ ] 是否有 SDK 自带的 page_view / page_leave 自动埋点？还是需要业务方手动调
- [ ] 是否区分 click / exposure 调用（如 `trackExposure(...)` 单独 API）

---

## 数据模型：`tracking-schema.yaml`

```yaml
tracking:
  # 必填：平台 + 命名约定
  platform: internal-sdk # 选 adapter
  naming_convention: snake_case # adapter 提供默认值，可覆盖

  # 早退闸门（与 events 互斥）
  skipped: false # true 时其余字段可省
  reason: '' # 跳过原因
  deferred: false # true = 暂缓，进 open_questions

  # 跨事件共享属性字典
  shared_properties:
    - name: user_id
      source: global.user.id
      type: string
      required: true
      notes: "未登录传 'anonymous'"
    - name: page_id
      source: route.name
      type: string
      required: true

  # 事件清单（核心）
  events:
    - id: search_submit # 平台无关稳定 ID
      name: search_submit # 平台事件名（默认 = id）
      type: click # click | exposure | page_view | state_change | api_event | custom

      # 触发器：引用前 3 份契约的 trace 锚点
      trigger:
        kind: binding # binding | state_transition | viewport | lifecycle | manual
        ref: 'binding:1:ui_to_event'

      # 触发时机精度
      fire_timing:
        on_click # on_click | after_api_success | after_api_error
        # | debounced_500ms | on_visible | once_per_session

      properties:
        - name: keyword
          source: searchInput.value
          type: string
          required: true
        - name: result_count
          source: data.results.length
          type: number
          required: false
          available_after: api_success # 解决"属性延后到达"的语义

      funnel: search_v1
      owner: growth-team
      priority: P0
      notes: '评估搜索词覆盖率'

    - id: result_card_view
      type: exposure
      trigger:
        kind: viewport
        ref: 'component:resultCard'
      fire_timing: on_visible
      debounce_ms: 500
      dedupe: per_session # never | per_render | per_session
      properties:
        - name: card_id
          source: item.id
          type: string
          required: true

  # 漏斗串联
  funnels:
    - id: search_v1
      name: '搜索主流程'
      steps: [page_view, search_submit, result_card_view, result_card_click]
      conversion_window: 30m

  # 开放问题
  open_questions:
    - id: tracking-q1
      priority: P1
      content: '登出时是否需要 logout 事件？'
```

---

## Platform Adapter 抽象

每个 adapter 是 `scripts/lib/tracking-adapters/<name>.js`：

````js
// scripts/lib/tracking-adapters/internal-sdk.js
export default {
  name: 'internal-sdk',

  defaults: {
    naming_convention: 'snake_case',
    auto_inject_properties: ['user_id', 'device_id', 'session_id', 'ts'],
  },

  // 平台特定校验
  validate(trackingDoc, context) {
    const errors = [];
    const sharedNames = new Set((trackingDoc.shared_properties ?? []).map((p) => p.name));
    for (const required of this.defaults.auto_inject_properties) {
      if (!sharedNames.has(required)) {
        errors.push(
          `internal-sdk: shared_properties must include '${required}' (auto-injected by SDK)`,
        );
      }
    }
    return errors;
  },

  // 渲染单个事件的代码片段
  renderEventSnippet(event, sharedProps, ctx) {
    const allProps = [...sharedProps, ...(event.properties ?? [])];
    const propLines = allProps.map((p) => `    ${p.name}: ${p.source},`).join('\n');
    return [
      '```ts',
      `// fire timing: ${event.fire_timing}`,
      `trackEvent('${event.name}', {`,
      propLines,
      '});',
      '```',
    ].join('\n');
  },

  // 验证清单
  renderTestPlan(events) {
    return [
      '## 埋点验证方法',
      '',
      '1. 打开内部埋点 Debugger 工具',
      '2. 触发各事件后检查 console 输出',
      '3. 上报后到内部数据平台 verify 看板查询事件名是否落库（5 分钟内）',
    ].join('\n');
  },
};
````

**注册表** (`scripts/lib/tracking-adapters/index.js`)：

```js
import internalSdk from './internal-sdk.js';
import generic from './generic.js';

const REGISTRY = {
  'internal-sdk': internalSdk,
  generic,
  // sensors, ga4, mixpanel 后续按需添加
};

export function getAdapter(name) {
  const adapter = REGISTRY[name];
  if (!adapter) {
    throw new Error(
      `unsupported tracking platform '${name}'. supported: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }
  return adapter;
}
```

---

## 输出文件 `tracking.md` 章节结构

1. **平台与命名约定** — adapter name、naming、自动注入属性列表
2. **共享属性字典** — 表格
3. **事件清单** — 总表（id / name / type / trigger / timing / funnel / owner / priority）
4. **事件详情** — 每个事件单独的属性表 + adapter 渲染的代码片段
5. **漏斗定义** — 步骤 + 转化窗口
6. **埋点验证方法** — adapter.renderTestPlan() 输出
7. **开放问题** — 数字编号列表
8. **Traceability** — `event:<id>` 和 `funnel:<id>` 锚点表

---

## 跨契约 trace 锚点扩展

新增锚点：

| 锚点          | 含义         | 校验                                                               |
| ------------- | ------------ | ------------------------------------------------------------------ |
| `event:<id>`  | 一个埋点事件 | 必须在 tracking.md Traceability 出现；trigger.ref 必须是已存在锚点 |
| `funnel:<id>` | 一个漏斗     | steps[] 必须全部是已存在的 event:<id>                              |

**spec.md 自动多出"埋点 Requirement"**：

```markdown
### Requirement: SearchPanel 埋点完整性

The system SHALL 触发契约定义的每个埋点事件，并携带必需属性。

#### Scenario: 点击提交时触发 search_submit

- WHEN user clicks submitBtn
- THEN tracker emits `search_submit` event with properties { keyword, result_count? }
- AND trace id `event:search_submit`
```

闭合"开发完才补埋点 → 改坏业务逻辑"的反模式。

---

## 阶段 5 用户体验流程

**入口（早退闸门）**：

```
━━ 阶段 5 / 5：埋点设计 ━━

需要埋点设计吗？
  yes    本组件需要埋点
  no     纯展示 / 内部工具组件，不埋点
  later  暂时跳过，记入 open_questions 后续补
```

**yes 路径内部分析协议**：

1. 列出阶段三所有 `direction: ui_to_event` binding，问每个是否需要埋点
2. 列出阶段三所有 `state_machine` 成功转换，询问业务转化埋点
3. 询问页面级事件（page_view、page_leave）和曝光埋点
4. 询问命名约定 + 漏斗分组
5. 输出 YAML 契约 → 用户确认

**用户确认模板**：

```
━━ 阶段 5 / 5：埋点设计 ━━

✅ 平台：internal-sdk（命名 snake_case）
✅ 共享属性：user_id, page_id

✅ 事件清单（3 个）：
- click  search_submit       on_click           → search_v1 漏斗 [P0]
- exposure result_card_view  on_visible(500ms)  → search_v1 漏斗 [P0]
- click  result_card_click   after_api_success  → search_v1 漏斗 [P0]

✅ 漏斗：search_v1（page_view → search_submit → result_card_view → result_card_click）

⚠️ 待确认：登出时是否需要 logout 事件 [P1]

确认后进入阶段六（自动生成规格文件）。
如需调整：
- 加事件 → "再加一个 [事件名]，触发于 [时机]"
- 改属性 → "search_submit 加一个属性 channel(string)"
```

---

## 实施清单

| 工作项                                                                                       | 工时                      |
| -------------------------------------------------------------------------------------------- | ------------------------- |
| `schemas/tracking-schema.json`（含早退闸门 oneOf）                                           | 1.5h                      |
| `scripts/lib/tracking-adapters/{index, internal-sdk, generic}.js`                            | 4h                        |
| `validate-contracts.js` 增加第 4 份契约 + adapter.validate 调用 + 跨契约引用                 | 3h                        |
| `generate-output.js` 增加 `generateTracking()` + spec 加埋点 Scenario                        | 5h                        |
| `validate-output.js` tracking.md 校验 + event/funnel trace 锚点                              | 2h                        |
| `templates/tracking-schema.yaml` + `templates/tracking.md` + `references/tracking-fields.md` | 2h                        |
| SKILL.md 增加阶段 5 章节                                                                     | 1.5h                      |
| Today-windvane golden 增加 tracking 维度                                                     | 1h                        |
| 5 个测试套件                                                                                 | 3h                        |
| CHANGELOG / README / operator-guide / contracts.md                                           | 1.5h                      |
| **合计**                                                                                     | **约 24.5h（≈3 工作日）** |

---

## 何时回来做

满足以下任一条件后再恢复实施：

- [ ] 至少 1 个真实项目完整跑过 v0.10.0 的四阶段流程，无重大问题
- [ ] 收集到 ≥ 3 个用户对当前 4 份输出文件的反馈，确认没有更紧迫的改进项
- [ ] 团队明确"埋点 SLA"：在 design 阶段就要求出 tracking spec，不能再"后补"

---

## 增量实施选项（如果想先小步验证）

如果担心 24.5h 一次性投入风险大，可以分两批：

**批次 1（PoC，~12h）**：先实现 `generic` adapter + schema + validator + 一份 golden，跑通整链路。
**批次 2（~12h）**：补 `internal-sdk` adapter + golden 升级 + 完整测试套件。

PoC 跑通后能验证架构假设（adapter 抽象是否真的够用、跨契约引用是否够用），再投入做 internal-sdk。

---

## 跨参考

- 当前主架构：`SKILL.md` 四阶段状态机
- 现有 trace 锚点系统：`scripts/lib/yaml.js` 的输出 + `validate-output.js` 的校验
- 当前埋点雏形：`notes.md` 的「埋点锚点」表（从 `ui_to_event` 自动生成）
