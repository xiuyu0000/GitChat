# Continuous Research System MVP - Task / Implementation Plan

基于项目的 `repo-audit.md` (代码审查)、`spec.md` (需求规格) 和 `design.md` (架构设计)，本文档将其转化为严谨、可落地的实施工作分解结构 (WBS)。
> [!IMPORTANT]
> **本文档为 Living Document（活文档）**。在后续开发阶段，所有任务的进度核销、临时发现的阻塞问题及对应的解决方案，均会在此实时更新标示。

---

## 📅 当前总体执行进况 (Execution Status)
- [x] **Phase 0: 基线梳理与重构准备** (100%)
- [x] **Phase 1: 画布基础能力补齐** (100%)
- [x] **Phase 2: 节点配置与智能编排扩展** (90%)
- [x] **Phase 3: 多画布与持久化** (100%)
- [x] **Phase 4: 防偏航回放与导出闭环** (100%)
- [ ] **Phase 5: 发布总回归与容灾建设** (70%)

### 本次实际落地更新 (2026-04-17)
- 前端已完成 `NodeChat.js` 的基座重构：引入 `src/store/researchStore.js`、`src/lib/graph.js`、`src/services/LLMNetworkClient.js`，移除旧 `Utility.js`。
- 已完成 `UserInputNode` / `LLMResponseNode` / `SummaryNode` 三类节点的统一数据结构、`NodeResizer` 接入、节点级配置面板、折叠式 Tool Payload 展示。
- 已完成串行生成队列、Abort 中断、Stale 标记、Token 60% 预警、Dexie 自动落盘、多 Session、Markdown 导出、全库 JSON 导入导出。
- 后端 `server.js` 已支持接收 `{ messages, config }`，允许节点级模型选择、`systemPromptOverride`、`thinking/search` 提示语注入。
- 已新增自动化测试：`src/lib/graph.test.js`、`src/services/LLMNetworkClient.test.js`、`src/store/researchStore.test.js`、`src/components/nodes.test.js`、`src/components/NodeChat.test.js`、`src/components/NodeChat.persistence.test.js`、`src/lib/db.test.js`，并补齐 `setupTests.js` 的 `fake-indexeddb` / `TextEncoder` / `ReadableStream` 测试 polyfill。
- 当前自动化验证结果：`cd nodechat && npm test -- --watchAll=false --runInBand` 通过；`cd nodechat && npm run build` 通过。
- 当前遗留问题：Tool Calling 仍是通过 `<thinking>` / `<search>` 约定文本块模拟，不是 OpenRouter 原生 `tool_calls` 结构；`msw` 驱动的真实延迟 SSE / Abort 测试、Markdown 导出黄金样本、手工 E2E 清单仍未补齐。
- 本轮复核新增确认：`NodeChat` 在 Token 阻断分支只弹全局警告，不会把后续排队节点标记为 stale；JSON 导入仍未做版本校验、schema 校验和“覆写本地库”二次确认；后端 `server.js` 的 OpenRouter endpoint/CORS 仍是本地硬编码，尚未 env 化。

---

## 一、阶段总览 (Phase Overview)

- **Phase 0: 基线梳理与重构准备**
  剥离原 `NodeChat.js` 的神级组件强耦合负担，解耦数据状态、上下文遍历算法与后端通信网关。奠定可测试基础。
- **Phase 1: 画布基础能力补齐**
  基于重构后的画布引擎，补齐自由尺寸调整、重写更稳定的排版以及基础的纯文本笔记结构支持。
- **Phase 2: 节点配置与智能编排扩展**
  赋予单节点独立参数配置能力，内置支持模型自主 Tool Call(搜索/思考)的折叠渲染，并打通前端级联的即时中断（Abort）能力与 Token 容量硬核警报体系。
- **Phase 3: 存储守护与多记录会话**
  集成 IndexedDB，实现毫无妥协的组件级自动落盘（Auto-save）以及多会话独立切换的系统隔离。
- **Phase 4: 防偏航回放与导出闭环**
  引入分支取消带来的“未对齐警告 (Stale)”机制，打通将选定图谱倒序解析后平铺出单线 Markdown 以及工程双导出的保底能力。
- **Phase 5: 全面防护测试与环境准备**
  从底层算法到外围操作的系统性自动化测试构建，以及发版前置要求。

---

## 二、详细任务表 (Detailed Tasks)

### Phase 0: 基线梳理与重构准备

#### [Task 0.1] 抽离 GraphContextBuilder 纯函数
- [x] **目标**：将当前散落在 `Utility.js` 等处的基于 DOM 分析的上下文拼接逻辑拔除。
- [x] **任务描述**：已以 `src/lib/graph.js` 落地，提供 `buildMessages`、`getDescendantNodeIds`、`buildMarkdownForNode`、`estimateBranchTokens`、`isValidDagConnection` 等纯函数。
- **涉及文件**：新增 `src/lib/graph.js`，删改 `Utility.js` 相关逻辑。
- [x] **同步测试任务 (TDD)**：已通过 `src/lib/graph.test.js` 覆盖上下文提取、祖先/后代遍历、DAG 校验、Markdown 导出、导出 payload 与 Token 预警逻辑。
- **输出物**：被 100% 测试覆盖的纯算法核心代码。
- **优先级**：P0 (Blocking)
- **并行**：否，第一步优先完成。

#### [Task 0.2] 引入 Zustand 接管纯全核心状态 (Data Layer 脱钩)
- [x] **目标**：消灭 `NodeChat.js` 中使用 `useNodesState`/`useEdgesState` 造成的面条型钩子嵌套。
- [x] **任务描述**：已建立 `src/store/researchStore.js`，由 Zustand 托管 `sessions`、`nodes`、`edges`、`generationQueue`、`ui/globalWarning` 与持久化快照。
- **前置依赖**：Task 0.1
- **输出物**：全新的 Zustand 容器，原 `NodeChat` 精简成为纯视图渲染包装。
- **优先级**：P0 (Blocking)

#### [Task 0.3] 统一抽象通信网关 LLMNetworkClient
- [x] **目标**：替代原来耦合在组件里硬编码的 SSE 发起，处理 AbortController 生命管理。
- [x] **任务描述**：已以 `src/services/LLMNetworkClient.js` 落地，统一处理请求体、SSE chunk 解析、`AbortController` 与错误上抛。
- [x] **同步测试任务 (TDD)**：已通过 `src/services/LLMNetworkClient.test.js` 覆盖 SSE 分帧、`[DONE]` 结束、payload error、HTTP 非 200 与 AbortError 行为。
- **优先级**：P0

### Phase 1: 画布基础能力补齐

#### [Task 1.1] 节点自由拉伸适配 `<NodeResizer>`
- [x] **目标**：告别内容撑开 DOM 的旧排版，转为用户自定义宽高控制以应对上千字单节点。
- [x] **任务描述**：`UserInputNode`、`LLMResponseNode`、`SummaryNode` 均已接入 `NodeResizer`，尺寸回写至 `data.measurements`。
- **前置依赖**：Task 0.2
- **风险**：旧版高度补偿逻辑（获取 DOM 高度自动排版连线位置）已整体移除，改为固定 measurements + 相对偏移生成。
- **优先级**：P1

#### [Task 1.2] 创建非依赖的备忘录节点 SummaryNode
- [x] **目标**：满足独立记录研究灵感，不污染全局上下文的诉求。
- [x] **任务描述**：`summaryNote` 已注册，禁用 DAG 连接，文本不会进入 `buildMessages`。
- [x] **验收标准**：已支持侧栏按钮创建独立 Note 节点。
- **优先级**：P2
- **并行**：可以与编排任务并行。

### Phase 2: 研究节点与智能编排扩展

#### [Task 2.1] 支持个体独立模型等设定挂载
- [x] **目标**：为所有源头需求点提供特异的对话策略定制。
- [x] **任务描述**：`UserInputNode` 已增加设置面板，支持 `model`、`enableThinking`、`enableWebSearch`、`systemPromptOverride`。
- [x] **验收标准**：前端请求体已升级为 `{ messages, config }`，后端根据节点配置下发模型和提示词。
- [x] **同步测试任务 (TDD)**：已通过 `src/components/nodes.test.js` 覆盖设置面板更新、Run 按钮和文本提交交互。
- **优先级**：P1

#### [Task 2.2] 拦截 Tool Calling 并重铸为可折叠展示容器 
- [x] **目标**：兼容外部大模型的自主 Tool Call 输出与搜索响应返回，维持图谱本身清爽。
- [x] **任务描述**：当前已支持将 `<thinking>` / `<search>` 文本块抽取为 `toolPayload` 并在 `LLMResponseNode` 顶部折叠展示。
- **当前问题**：尚未接入 OpenRouter 原生 `tool_calls` JSON 结构，现阶段仍属于提示词约定驱动的 MVP 方案。
- **优先级**：P1

#### [Task 2.3] 引入断联取消 (Abort) 与遗留节点阻断能力
- [x] **目标**：防止多米诺报错、无限制消耗网络连接；实现修改节点后的分支终止保护。
- [x] **任务描述**：已增加全局 Stop 按钮、串行生成队列、`AbortController` 终止与 pending 节点 `isStale` 标记逻辑；已保留未重跑节点的历史文本。
- [ ] **同步测试任务 (TDD)**：已由 `src/services/LLMNetworkClient.test.js` 覆盖 AbortError 基础行为；但 `msw` 级“延迟流 + 取消后断言 stale / 旧文本保留”的编排级测试尚未编写。
- [x] **验收标准**：手工路径已跑通；自动化覆盖仍待补。
- [ ] **复核问题**：`processGenerationQueue()` 在 `blocked` 分支只 `break`，不会像 `aborted/failed` 那样给剩余 queued 节点补 `isStale`；这与“链路中断后下游状态必须显性降级”的设计目标仍有偏差。

#### [Task 2.4] Token 安全用量标尺与 60% 限额警报触发机制
- [x] **目标**：严死防范图拓扑在演变中无故突破单次传输 Token 极值炸服。
- [x] **任务描述**：已在 `graph.js` 中实现简化 Token 估算与 60% 阈值判断，并在发包前阻断队列继续执行。
- **优先级**：P0 (Spec强要求防崩溃机制)

### Phase 3: 多画布与持久化

#### [Task 3.1] Dexie.js (IndexedDB) 本地数据库架构铺设
- [x] **目标**：彻底告别“重开机就没”的恶性体验。
- [x] **任务描述**：已引入 Dexie，完成 `sessions / nodes / edges` 三表与 500ms debounce 自动存盘。
- [x] **同步测试任务 (TDD)**：已通过 `src/store/researchStore.test.js` 覆盖 import/hydrate 相关 store 行为，并在 `setupTests.js` 中接入 `fake-indexeddb`。
- [ ] **剩余补测**：高频更新与 500ms debounce 落盘准确性专测尚未编写。

#### [Task 3.2] 会话选择器与状态快照恢复 (Hydration)
- [x] **目标**：满足工作台上存在无数分项子工程。
- [x] **任务描述**：侧边栏 Session UI 已支持新建、切换、重命名、删除；切换后重新 hydrate 并 `fitView`。

### Phase 4: 导出与研究闭环补齐

#### [Task 4.1] 落跑“未对齐异常 (Stale)”高亮遮罩
- [x] **目标**：避免用户因截断重发保留了旧文本而形成严重的错置知识点引用（张冠李戴）。
- [x] **任务描述**：已在取消逻辑中标记 pending 节点 `metadata.isStale=true`，`LLMResponseNode` 以红色边框和 Stale Badge 呈现。
- [x] **同步测试任务 (TDD)**：已通过 `src/components/nodes.test.js` 覆盖 stale badge、错误卡片与 tool payload 折叠区渲染。
- [ ] **剩余补测**：缺少“真实中断后下游节点被标 stale”的编排级断言。

#### [Task 4.2] 单向链路平铺 Markdown 反推导出
- [x] **目标**：最终的研究产出物萃取。
- [x] **任务描述**：已在侧栏暴露 “Export Selected Chain”，沿祖先链构建 Markdown 并下载。

#### [Task 4.3] 系统级 JSON 工程备份导入/导出方案
- [x] **目标**：规避浏览器强力无痕清场带来的毁灭代价。
- [x] **任务描述**：已支持全库 JSON 导出与导入覆写。
- [ ] **复核问题**：当前 `handleImportFile()` 仅 `JSON.parse` 后直接 `importProject(payload)`；尚未实现 `version` / schema 校验，也没有 destructive import 的二次确认。

### Phase 5: 发布总回归与容灾建设

*(注：各项核心功能的单测、集成测试及关键 E2E 均强推 **测试驱动开发 (TDD) **与业务交付同吃同住。因此 Phase 5 将全员转向大网收拢的极端手工测试与保障基建)*

#### [Task 5.1] 测试基座与 Polyfill 收口
- [x] **目标**：为后续补测提供稳定的 Jest 基座，消灭基础环境缺项。
- [x] **任务描述**：已在 `src/setupTests.js` 接入 `fake-indexeddb`、`TextEncoder` / `TextDecoder`、`ReadableStream`、`ResizeObserver` 与 `URL.createObjectURL` polyfill。

#### [Task 5.2] 纯函数层补测扩面
- [x] **目标**：让上下文遍历、导出与 Token 预警不再只依赖 happy-path。
- [x] **任务描述**：`src/lib/graph.test.js` 已补齐祖先链、后代遍历、空消息过滤、导出 payload 与阈值边界。

#### [Task 5.3] 网络层流解析与错误模型补测
- [x] **目标**：锁定 SSE 客户端在正常/异常/中止三种场景下的行为。
- [x] **任务描述**：`src/services/LLMNetworkClient.test.js` 已覆盖 chunk 拼接、`[DONE]`、payload error、HTTP error 与 AbortError。

#### [Task 5.4] Zustand Store 行为补测
- [x] **目标**：为 `researchStore` 的状态机建立独立护栏，减少 UI 集成测试压力。
- [x] **任务描述**：`src/store/researchStore.test.js` 已覆盖初始化 workspace、composer flow、regeneration targets、节点配置更新和 project import。

#### [Task 5.5] 节点 UI 合约补测
- [x] **目标**：锁死节点级交互契约，确保设置面板与显示态不回退。
- [x] **任务描述**：`src/components/nodes.test.js` 已覆盖 `UserInputNode` 设置面板、`LLMResponseNode` stale/error/tool payload、`SummaryNode` 文本提交与 `NodeResizer` 回调。

#### [Task 5.6] `NodeChat` 编排集成补测
- [x] **目标**：验证 send / stop / token 阻断 / stale 级联这些跨层行为。
- [x] **任务描述**：已通过 `src/components/NodeChat.test.js` 用稳定的 ReactFlow 轻量 mock 覆盖 send、stop、token 阻断三条主路径，并验证 queued descendant 的 stale 标记。

#### [Task 5.7] Dexie 防抖落盘与 Session Hydration 深测
- [x] **目标**：验证 500ms debounce 持久化不会漏写，也不会错误串 session。
- [x] **任务描述**：已通过 `src/components/NodeChat.persistence.test.js` 覆盖 500ms debounce 自动落盘时序，并通过 `src/lib/db.test.js` 覆盖 `saveSessionSnapshot` / `loadSessionSnapshot` / `replaceDatabase` 的隔离与替换语义。

#### [Task 5.8] 整体验收与超重度探索性测试 (Manual E2E)
- [ ] **目标**：以科研人员身份手工走通大图缩放、连续生成、级联中断、Markdown 导出、Project JSON 导入导出与刷新恢复。
- [ ] **输出物**：一份可重复执行的 smoke checklist，纳入发版前手工验收。

#### [Task 5.9] 环境变量体系配置与容灾兜底
- [ ] **目标**：完成 API endpoint env 化、请求超时、全局 Error Boundary 与导入错误恢复。
- [ ] **任务描述**：对 `OpenRouter` Endpoint 准备独立配置读取，完善 Error Boundary 接管 `fetch` 超时崩溃导致的组件级白屏（退回报错卡片视图并引导用户重新按发起键）。

#### [Task 5.10] 对齐 `docs/bootstrap/test-plan.md` 的测试资产补完
- [ ] **目标**：把当前“已有零散单测”推进到 `test-plan.md` 中承诺的测试层级。
- [ ] **任务描述**：补 `msw` 延迟 SSE / Abort / stale 流程测试、负向导入测试、Session 切换/刷新恢复测试、Markdown 导出黄金样本测试，以及手工 smoke checklist。
- [ ] **当前差距**：
  1. `test-plan.md` 规划了 `msw` 驱动的延迟流与 `<tool_calls>` 结构回放，但仓库里尚未真正使用 `msw`。
  2. `fake-indexeddb + Zustand` 的基础持久化闭环已补上，但 `Session` 切换/刷新恢复与负向导入路径仍未形成完整回归矩阵。
  3. `TC-03/TC-04/TC-05` 级别的主线里，编排层 send/stop/token 与 IDB debounce 已有覆盖，但真实延迟流 Abort 和 Markdown Export golden file 仍未自动化。
  4. 规划建议 `__fixtures__/` 测试样本库与手工探索矩阵，当前仓库尚未建立。

---

## 六、当前阻塞与后续补丁清单

1. **真实 Tool Calling 尚未接入**
   - 当前前端只解析 `<thinking>` / `<search>` 文本块，仍未消费 OpenRouter 原生 `tool_calls` 或结构化中间事件。
   - 影响：MVP 可演示，但不具备真正的工具调用协议兼容性。

2. **测试资产与真实延迟流场景仍未完成**
   - `NodeChat` 编排集成与 Dexie 防抖专测已补齐，但仍缺 `msw` 驱动的延迟 SSE + Abort + stale 断言、Markdown 导出黄金样本、Session 切换/刷新恢复和手工 smoke checklist。
   - 影响：主路径自动化护栏已经建立，但与 `test-plan.md` 对齐的全套资产尚未收口。

3. **测试环境仍有 CRA 旧栈噪音**
   - `npm test` 通过，但会打印 React Testing Library `act` deprecation warning 和 Jest worker 退出噪音。
   - 影响：不阻塞当前开发，但后续若继续扩展测试，建议补齐更稳定的测试 teardown 或升级测试栈。

4. **错误兜底仍偏轻**
   - 当前已有节点级错误文本展示，但尚未实现真正的全局 Error Boundary 和 fetch 超时分层恢复。
   - 影响：满足基础可见错误反馈，但离最终发版兜底标准还有距离。

5. **当前实现与设计文档仍有若干行为偏差**
   - Token 阻断后的队列降级不完整；JSON 导入仍无版本/schema 校验与二次确认；IndexedDB 不可用时没有全局告警；后端 endpoint/CORS 仍未 env 化。
   - 影响：MVP 主路径可跑，但异常路径与运维配置仍偏脆弱。

---

## 六点五、下一步执行顺序

1. 先完成 `[Task 5.10]`：对齐 `test-plan.md` 里的 `msw`、fixtures、Markdown golden file、Session 切换/刷新恢复和手工 smoke 资产。
2. 再修补 `Task 2.3 / 4.3 / 5.9` 的功能偏差：补 token 阻断后的 stale 处理、导入前校验/确认、env + Error Boundary。
3. 最后处理原生 Tool Calling backlog，把协议兼容性补齐。

---

## 三、里程碑建议 (Milestones)

1. **Milestone 1 (架构稳健期)**：完成 Phase 0 与 Phase 1 的核心剥离与尺寸修正。此时的系统是个可以在控制台拖拽放大缩小的稳定“骨架”，不再怕代码纠缠；同时 Context 不会因循环依赖抛死锁错。
2. **Milestone 2 (智能连通期)**：完成 Phase 2 的多模型参数悬浮盘挂载与折叠渲染展示，中止请求按钮可以奏效，令牌超载保护跑通。到此时产品可用，具有极高的逻辑推导战力。
3. **Milestone 3 (存储出离期)**：达成 Phase 3 与 Phase 4。系统拥有 IndexedDB 保存兜底以及可将成果 Markdown/JSON 双向输入输出；Stale 遗忘报警全面上线。宣布进入最终发布验收可用闭环 MVP 状态。

---

## 四、关键路径 (Critical Path)

如果以下任务不率先完成，全盘进度就会卡死堵塞：
`[Task 0.1]` Context 算法抽出纯生函数 -> `[Task 0.2]` Zustand State接管 -> `[Task 1.1]` 画布旧高度逻辑破坏后由自定义 Resizer 替换重排 ->  `[Task 3.1]` 对接到 IndexedDB -> `[Task 2.3]` 进行高级重载控制并暴露错误状态（如果前端接不了中止与防抖，一旦引入级联重试将摧毁性能和后端账户）。

---

## 五、适合先做 Spike / Prototype 的任务

基于当前代码环境的风险分析，建议首先开单独分支试验以下高危特性，证实没问题后再 merge 入主任务主线：
1. **Zustand Headless Hook + React Flow 无头状态控制的联结**：
   - 因为 React Flow 组件底层天然包裹了自己的高度优化上下文数组。一旦将驱动权彻底移交给外部状态管理仓库（Zustand 持有 Truth 源），在 100 张画板卡片渲染时是否会因 Zustand 选择器 (Selectors) 粒度不精细反而导致整体严重 Diff 掉帧卡顿。必须单独 Spike 跑个 300 节点量级的填充验证平滑性。
2. **基于 Dexie 的 Store 变动快照高频触发节流验证**：
   - 证明防抖（Debounce）后的状态对象可以保证浏览器完全意外崩溃时不丢失最后的编辑结果片段但不至于将磁盘操作夯死主线程。
