# Continuous Research System MVP - Design

基于 `repo-audit.md` 与 `spec.md`，本文档详细阐述在此代码库上落地 MVP 的架构设计方案与实现路径。

---

## 一、设计目标

### 1. 本次设计要达成什么
- **架构剥离**：彻底将 React 渲染图层（React Flow）与业务数据层（节点 CRUD、上下文算法）脱耦。
- **功能基座夯实**：引入 IndexedDB 本地持久化与 Token 热更新监控，打破原型玩具的约束，使其支撑长时间重度研究作业。
- **能力矩阵对齐 Spec**：在架构上预留单节点多模型调用接口，支持大语言模型 Tool Call（含 Web Search 和 Thinking）的数据挂载折叠呈现机制。

### 2. 优先优化什么
- 状态更新的**防雪崩计算**：原本通过 React State 循环数组导致大型图谱卡顿。
- 上下文递归提取逻辑：将其剥离为 100% 纯函数以保障其随时可高频无痛执行。
- 网络请求的可中断性：原系统 Stream 不可暂停，这极占资源。

### 3. 明确不解决什么
- 任何形式的前端本地嵌入式 RAG/本地向量检索库搭建。
- 服务端中心化账户体系。
- 复杂的边路由算法或环图消解判定（强行约束只允许构建有向无环图 DAG）。

---

## 二、总体架构

### 1. 系统边界
- **Client (Frontend)**：承担 95% 业务。管理多画布会话、维护有向无环图谱拓扑、计算 Token、发起流式渲染指令、导出数据产物。
- **Server (Backend API Proxy)**：极其轻薄。作为一个无状态的纯网关中继，负责隐藏 API Key 并绕过浏览器的 CORS 限制，统一与大模型提供商（如 OpenRouter）进行 HTTP SSE 流式通信。

### 2. 画布层、数据层与通信层职责划分
- **渲染视图层 (Canvas & Components)**：只负责按照坐标和大小渲染框体，将拖拽移动等底层 Mouse Event 转化为意图发往状态层。
- **研究状态数据层 (Store / Data Layer)**：全盘掌握图谱真理，持有所有 Node/Edge 阵列结构。
- **业务编排层 (Orchestrator)**：处理 `Trigger Generate`，提取当前指针的 Graph Context，发起 Fetch，并将后端吐出的 Chunk 推回状态层保存。
- **持久化层 (Storage Layer)**：静默监听状态层变更快照（Snapshot），写盘 IndexedDB。

### 3. 当前架构与目标架构对照

| 维度 | 现有架构 (GitChat 原型) | 目标 MVP 架构设计 |
| :--- | :--- | :--- |
| **状态管理** | 数据存放在 `NodeChat.js` 的 `useNodesState` 等本地 state。 | 抽出全局 `zustand` Store，支持独立方法与计算，脱离特定组件生命周期。 |
| **持久化** | 纯内存，刷新即灭。 | 基于 `Dexie.js` 封装异步离线图谱库，载入立刻 Hydrate。 |
| **上下文拼装** | `Utility.js` 查 DOM 元素、递归 React 态，和 UI 混杂。 | 单独的纯函数服务 `GraphContextBuilder`。 |
| **工具挂件** | 无 | Schema 新增 `metadata` 嵌套层级，容纳 Tool Call 等附加返回载荷。 |

---

## 三、模块设计

### 1. 数据状态与持久化驱动模块 (`useResearchStore`)
- **目标**：全维接管所有运行时业务流状态。
- **职责**：执行增删改查；防并发冲突；通知 UI 渲染。
- **对外接口**：`addNode()`, `updateNodeData()`, `removeElements()`, `layoutNodes()`。
- **与其他模块关系**：UI 的顶层；持久化模块的事件发射源。
- **是否需要重构**：**完全需要重构**。抛弃原本直接调用 ReactFlow hook 维护状态的做法。

### 2. 画布引擎与节点视图模块 (`ResearchCanvas`)
- **目标**：高性能提供节点定位与拖放体验。
- **职责**：将 Store 内的数据转为 React 虚拟 DOM 展现；提供手动 Resize Handle。
- **关键状态**：Viewport (x, y, zoom)。
- **是否可复用现有实现**：React Flow 基础代码壳子可复用，大量对业务状态更新掺杂的方法需删除。

### 3. 对话编排与上下文组装模块 (`GraphContextBuilder`)
- **目标**：依据连线正确地提取从根部到任意选中节点的大模型请求语料。
- **职责**：上行递归查找先驱节点；组装为符合 OpenAI/Anthropic SDK 的 `[{"role": "user", "content": "..."}]` 标准格式。
- **是否需要重构**：提取出 `Utility.js` 中的零碎代码，标准化入参和出参。

### 4. 模型管控网络层 (`LLMNetworkClient`)
- **目标**：稳定并可控地进行请求获取分发。
- **职责**：维持 `AbortController` 掌控生命周期；挂载各个节点的特异性控制条件（Model 标识符）。
- **对外接口**：`streamInference(contextArray, modelConfig, onChunk, onEnd, onError)`
- **是否需要重构**：需重构，原代码中无中止设计，缺少网络容错。

### 5. 衍生行动解析显示模块 (Tool-Call & Thinking Parser)
- **目标**：解决大模型使用搜索能力或思考过程对常规界面的视觉污染。
- **职责**：拦截网络流中的特殊标志块（如 `<thinking>` 或 `tool_calls`），不将其算作最终 markdown 正文，而是将其放进节点特定的折叠 UI 组件区。
- **是否需要重构**：**新增模块**。

---

## 四、数据模型设计

### 1. 核心实体图谱字段
一切的核心归于 Zustand/IndexedDB 之间统一持有的基础 Schema：

#### Session Workspace (会话画布级实体)
- `id`: string (UUID)
- `title`: string (研究主题名)
- `createdAt` / `updatedAt`: timestamp

#### Node (节点实体)
- `id`: string
- `type`: enum (`userInput`, `llmResponse`, `summaryNote`)
- `position`: `{x: number, y: number}`
- `measurements`: `{width: number, height: number}` (支持可缩放拉伸)
- `data`:
  - `content`: string (用户文本或生成结果正文)
  - `role`: enum (`user`, `assistant`)
  - `config`: (如果是 User 节点，包含自身的专属执行选项)
    - `model`: string (选定使用的基础模型)
    - `enableWebSearch`: boolean
    - `enableThinking`: boolean
    - `systemPromptOverride`: string (供专家微调)
  - `toolPayload`: array (用于折叠式存放思考内容或工具请求记录)
  - `metadata`:
    - `accumulatedTokens`: number (到达此节点累积上游总和消耗 Token 数)
    - `isStale`: boolean (因为上游被重写而自己遭遇截断、发生上下文语义未对齐断裂的状态标记)
  - `status`: enum (`draft`, `generating`, `done`, `error`)

#### Edge (边)
- `id`: string
- `source`: node_id (前置)
- `target`: node_id (后置)

### 2. 字段生命周期判定（对应 Spec）
- **MVP必须**：上述字段全集皆为实现 Spec 中独立节点策略和 Token 阻断的核心，均为 MVP 必须。
- **预留/未来扩展**：Edge 的 `type / label` 预留空位，未来支持连线语义化；
- **调试友好**：特意切分了 `content` 与 `toolPayload`，方便测试独立渲染隔离有效性。

---

## 五、关键流程设计

以下详细分解 3 个最高频复杂的过程：

### 1. 节点生成级联更新逻辑并在中途强行中止 (`Abort Cancel`)
- **触发点**：用户点击了某个带有后继孩子的 User 节点上的“再生 ♻️”按钮，生成了数个子节点气泡；用户觉察到上游方向偏离，立刻点击界面漂浮的全局 `Cancel` 按钮。
- **核心处理步骤**：
  1. Store 接收到 Cancel Action，触发保存在内存管理器里的 `AbortController.abort()` 实例。
  2. 网络请求强制终端抛出 `AbortError`。
  3. `NetworkClient` 捕捉 Error，通知状态控制器终止更新循环。
  4. 遍历当前维护的“正在等待生成”队列，将这些排队等待被波及刷新的下游节点的 `data.metadata.isStale` 置为 `true`（维持其修改前原样呈现，不覆写丢失旧数据，但施加失效标记）。
- **状态变化**：已被部分传输的那个截断节点设为 `done` 并保留半截断语句。排队的后续节点在底层数据内容上无任何折损，但在 UI 渲染上需展示鲜明的“未对齐警告 (Stale Mismatch)”图层遮罩，严防用户因拼错上文产生严重误判。

### 2. 单节点切换不同模型发起对比的流程
- **触发点**：已有 `UserNode1` 的输出。用户在此节点上通过右上角 Context Menu 拉出“配置属性”，选中 `Claude-4.7-Opus`，保存，而后从 `UserNode1` 点击“衍生思考”。
- **状态变化**：新建的派生 `Generative Node 2` 和其衍生的下一环输入均被打上了新的 `data.config.model = 'Claude-4...'` 烙印。
- **核心步骤**：大模型发起请求前，`ContextBuilder` 收集上游信息并上抛，通信层识别到自身的触发源节点的 Config 对象不为空，则打包至 Fetch Payload `{"model": "Claude..."}`。
- **输出结果**：画布上来自同一个源头的两个并列子节点响应，通过截然不同的模型完成（可通过 Debug 标签证实）。

### 3. Token 使用量预警与分支隔离
- **触发点**：收到一次大模型长流返回完成事件。
- **处理步骤**：调用前端离线精简版的 `tiptoken-js` 对整条 `Root -> Current Node` 的全汉字字符转化近似 Token 值进行累加，写入 `accumulatedTokens`。
- **检查拦截**：当检查到其超过安全预警阈值 60% 后（如超过 8k token 若上限为 16k），全局抛出 Toast 或当前节点展示显眼黄色角标 Alert：`单列上下文超载预警，建议在尾部新建总结便签整理现状`。

---

## 六、MVP 补充能力的设计判断

| 补充能力 | 决策结论 | 理由与依据 |
| :--- | :--- | :--- |
| **节点尺寸拖拽拉宽/拉高** | **纳入 MVP (Must Have)** | 原仓库依赖纯文本撑开高度，遇长文本视觉必然崩溃，且长线排版无用武之地。需在 `Node` 组件外壳套一层基础的 `<NodeResizer>`。 |
| **自动静默保存** | **纳入 MVP (Must Have)** | 高危知识工作。依赖 IndexedDB 写每次 Change 的 debounce 500ms 定时防抖快照机制。 |
| **单次平铺 Markdown 导出与 JSON 工程双导** | **纳入 MVP (Must Have)** | 这是系统的兜底与变现环节。支持顺着链路 `.md` 导出以供研究阅读。另外必须支持全量持久化为外部静态独立工程文件（JSON Format），用作脱离 IndexedDB 风险的硬体备份。 |
| 来源引用与溯源高亮 | 预留结构/本期简化 | 只需要将 tool_call 里的网链作为正文底层超链接甩出即可。无需做高级高亮线关联。 |
| 撤销与快照回滚重做 | 暂不考虑 | 时序复杂度高，手动修改删线能解决 80% 痛点且省去大量的内存占用。 |

---

## 七、可测试性设计 (Testability)

本部分是改造劣质原型为工业基础软件的护城河：

### 1. 结构大解耦（提高单纯逻辑测试屏障）
将**数据遍历搜集**脱离出 React Lifecycle：
- **`GraphContextBuilder.ts`** 导出纯函数 `buildMessages(nodeId, nodes, edges)`。
- 我们可以在 Jest 中输入 5 个手动虚构的 Array Objects，并断言其输出是否合并成了正确的 5 条 Context。如果这里耦合于 React Ref 中，则必然需要 DOM 沙盒介入，拖慢并极难测试。

### 2. Mock 设计防御点
- **网络调用层**：`LLMNetworkClient`。它的接口接收完整的 Prompt Array 返回异步流。在 End-2-End 单元测试中可以轻松实现为 `MockNetworkClient` 定投延迟或者截断测试 `Abort` 等行为，不用真花钱发 OpenAI 请求。
- **Dexie 持久层**：可在测试模式利用基于 Memory 的 Fake IndexedDB，保证执行无副作用。

### 3. 既往业务不利用测试分析
- **目前实现缺陷**：原先 `Utility.js` 通过搜集页面 DOM 元素的 `offsetHeight` 来判断怎么排版下划新节点。这永远无法无头 (Headless) 测试。
- **建议重构**：统一将节点大小改为基于 React Flow Node 自身的固定 Width/Height 设定。布局可基于简单的纵深计算策略。

---

## 八、错误处理与恢复

1. **模型调用断流/请求失败**：
   - 报错节点直接通过 CSS 渲染一层红底或错误标。并且提供按钮【点击清除本节点的损坏内容并原态重试】。
2. **后端网关服务/搜网报错**：
   - 大多为 API KEY 逾期或上游被墙。利用 Error Boundary 以及 `toast(message)` 冒泡到系统全局给用户可见的解释反馈。在 Payload 内置字段写入错误详情备查。
3. ** IndexedDB 失效或损坏**：
   - 数据加载如遇异常 Schema 版本，触发 Fallback 强制备份导出当前的未脏数据；弹窗提示修复。

---

## 九、性能与扩展性评估

1. **当节点数量超百的渲染阻塞问题**：
   - React Flow 内部已经封装了视口剔除（Viewport Culling），不在屏幕范围内的节点不会全量重绘。保证了基础的底座性能。
   - **绝不能偷懒的**是状态机 Zustand 层，必须善用 Selector 提取更新，绝不可在输入框敲入一个字幕，强迫整个 `nodes[]` 大数组整体更换引用而引发多米诺型大组件 Diff 重绘！
2. **异步平铺流构建**：
   - 图查询在 500 个节点级别的时间不到 1 毫秒，不必担心前置查找。但流写入必须通过稳定的 requestAnimationFrame 限流避免主线程饿死。

---

## 十、设计权衡 (Trade-offs)

1. **为 MVP 让路的妥协：单画布多路径并行请求削减为队列串行。**
   - **简化**：原版设计如果在老祖宗节点点重新生成，会产生炸屏一样的并发。虽然极具观感，但在 MVP 中，将所有的重新请求限制为了单一处理队列，或者最多支持 2-3 个并发。
   - **代价**：失去了并行演算极限推演的暴力美学展现效率。
   - **后续修补**：待 Token 计费池与可控性机制摸清后支持大并发（Concurrency Pool）。
2. **无中心化服务端的妥协，依赖纯前端 IndexedDB 面临极其被动的回收风险。**
   - **代价与修复**：浏览器的无痕模式断电或隐私清理动作，会毫不留情地抹杀科研心血。在缺失云端中心数据库的 MVP 阶段，我们强迫引入了手动将整块画布导出为物理的本地 JSON 工程文件 `Save as Project` 机制进行兜底接管，并在系统侧显著提示用户定期外部备份。

---

## 十一、现有代码映射

| 现有文件 | 目标设计定位 | 改造指令 |
| :--- | :--- | :--- |
| `NodeChat.js` | 拆离。 | 此神级大文件被删碎处理。解耦为：`canvas/ResearchCanvas.tsx` (纯 UI 框架层) 以及 `store/researchStateStore.ts` (Zustand 承载业务)。 |
| `UserInputNode.js` | 扩展重构。 | 需要抛弃部分根据 `textarea` 死算的 CSS 高度魔法，转为直接接入 React Flow 的 `NodeResizer`。增加一个 `<SettingsPopup/>` 用于特异性控制大模型选择/思考/联网参数项的界面入口。 |
| `LLMResponseNode.js` | 扩展重构。 | 将折叠代码改为展示 Tool Calls (即搜索/思考中间态结构)。 |
| `Utility.js` | 改名重构为纯函数。 | 重命名整合为：`lib/GraphContextBuilder.ts`。剥离旧版本和 DOM 的交织。 |
| `server/server.js` | 基本保留网关特性。 | 可加一行 CORS/Body Limit 控制以避免被截断问题。保持原样作为 proxy 即可。 |

---

## 十二、已知关键预设 (Assumptions)

**项目推进前提确认：**
1. **安全中止与数据脱节体验**：当在深度级联局部重试中触发截断保留时，为防止下游留存的旧记录对科研者造成隐蔽的“张冠李戴”逻辑误导，所有因取消而漏刷新的下游残存节点都会被挂上醒目的 `Stale (未对齐)` 警告角标与红线。
2. **可靠的双擎存储**：借助 IndexedDB 处理临时秒级防抖存储体验，同时强制搭配 `.json` 全图工程文件的 Import/Export（导入导出），建立物理隔离的最强离线数据屏障，抗衡浏览器配额危机。
3. **图论约束保证性能**：画布节点验证机制将严密把拦新连线的成立条件，绝不允许后裔链接先祖，硬性在 UI 层形成有向无环图 (DAG)，从而根本上解决递归无限耗散的灾难场景。
4. **工具全盘委托策略**：MVP 当中的“思考（Thinking）”以及“网络发散检索（Searches）”，不会在前端造独立的代理查询，全部依赖大模型的原生 Server Tool Call 进行回传嵌套。前端单纯负责降噪拦截与嵌套渲染。
