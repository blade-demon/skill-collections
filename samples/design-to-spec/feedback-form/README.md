# Sample: feedback-form

第二个 hands-on sample，与 `search-panel` 形态互补：

|              | search-panel         | feedback-form                 |
| ------------ | -------------------- | ----------------------------- |
| HTTP 方法    | GET                  | POST                          |
| 主导 binding | `api_to_ui`          | `ui_to_api` + `request_body`  |
| 状态机焦点   | 数据获取             | 表单提交 + 字段级校验         |
| 多字段       | 1（keyword）         | 3（rating / comment / email） |
| validation   | 后端 INVALID_KEYWORD | 前端 + 后端 双层              |

## 这个 sample 教什么

- 表单类组件如何在契约里表达 **request_body 字段**（与 GET 的 `params` 平行）
- **字段级校验状态**（element-scoped）vs 表单级提交状态（component-scoped）
- 多个 `ui_to_api` binding（`source_ui` 不同字段 → `target_api` body 字段）
- "提交按钮的 disabled 条件" 如何在 spec 中可断言
- POST 成功后**没有列表渲染**——success 态是清空表单 + 显示确认信息

## 不教什么

- 复杂表单（动态字段、嵌套对象、文件上传）—— 留给后续 sample
- 表单状态库（formik / vee-validate）—— 用原生 JS 突出 spec→impl 对应
- 多步表单（wizard）—— 应该按 operator-guide §2 拆成多个 sample

## 布局

```
samples/design-to-spec/feedback-form/
├── README.md
├── package.json
├── inputs/
│   ├── design.svg                  # 4 状态：idle / submitting / success / error
│   ├── api.md                      # POST /api/v1/feedback 文档
│   └── interaction-notes.md        # 提交时机 / 校验规则 / 错误处理
├── design-spec/feedback-form/
│   ├── contracts/                  # 三份 YAML
│   ├── notes.md
│   ├── data-fetching.md
│   └── specs/feedback-form/spec.md
├── src/
│   ├── index.html
│   ├── main.js
│   ├── mock-feedback.js
│   └── style.css
└── walkthrough.md
```

## 跑起来

```bash
# 仓库根
npm install                        # 已装可跳过

cd samples/design-to-spec/feedback-form
npm run dev                        # vite 起本地服务，浏览器自动打开
npm run build                      # 产物到 dist/
```

mock-feedback.js 提供 4 种 mock 模式（success / validation-error / network-error / rate-limited），通过页面顶部下拉切换。

## 推荐阅读顺序

1. `inputs/` 三件（5 分钟）—— 先看人写的原始材料
2. `walkthrough.md`（15 分钟）—— 看 4 阶段过程
3. `design-spec/feedback-form/spec.md` 的 Scenario 列表（5 分钟）
4. `src/main.js` 对照 `data-fetching.md`（15 分钟）
5. `npm run dev` 把 4 状态点一遍（5 分钟）
