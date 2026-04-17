# Continuous Research System MVP - Task / Implementation Plan

基于项目的 `repo-audit.md` (代码审查)、`spec.md` (需求规格) 和 `design.md` (架构设计)，本文档将其转化为严谨、可落地的实施工作分解结构 (WBS)。
> [!IMPORTANT]
> **本文档为 Living Document（活文档）**。在后续开发阶段，所有任务的进度核销、临时发现的阻塞问题及对应的解决方案，均会在此实时更新标示。

---

## 📅 当前总体执行进况 (Execution Status)
- [ ] **Phase 0: 基线梳理与重构准备** (0%)
- [ ] **Phase 1: 画布基础能力补齐** (0%)
- [ ] **Phase 2: 节点配置与智能编排扩展** (0%)
- [ ] **Phase 3: 多画布与持久化** (0%)
- [ ] **Phase 4: 防偏航回放与导出闭环** (0%)
- [ ] **Phase 5: 发布总回归与容灾建设** (0%)

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
- [ ] **目标**：将当前散落在 `Utility.js` 等处的基于 DOM 分析的上下文拼接逻辑拔除。
- [ ] **任务描述**：建立 `src/lib/GraphContextBuilder.ts`。实现一个纯函数，接收 `(targetNodeId, allNodes, allEdges)`，向祖先向上递归，并映射生成 OpenAI Schema 的 Messages Array。
- **涉及文件**：新增 `GraphContextBuilder.ts`，删改 `Utility.js` 相关逻辑。
- [ ] **同步测试任务 (TDD)**：编写 `GraphContextBuilder.test.ts` 进行 Jest 单测。输入带有循环死锁或深分支的 Mock Graph Objects，断言输出匹配，作为重构的绝对护城河。
- **输出物**：被 100% 测试覆盖的纯算法核心代码。
- **优先级**：P0 (Blocking)
- **并行**：否，第一步优先完成。

#### [Task 0.2] 引入 Zustand 接管纯全核心状态 (Data Layer 脱钩)
- [ ] **目标**：消灭 `NodeChat.js` 中使用 `useNodesState`/`useEdgesState` 造成的面条型钩子嵌套。
- [ ] **任务描述**：建立 `src/store/researchStore.ts`。利用 Zustand 托管 `nodes[]` 和 `edges[]`，抽象出基础的 `addNode`, `deleteNode`, `updateNodeData`, `onNodesChange` 的 Headless Action。
- **前置依赖**：Task 0.1
- **输出物**：全新的 Zustand 容器，原 `NodeChat` 精简成为纯视图渲染包装。
- **优先级**：P0 (Blocking)

#### [Task 0.3] 统一抽象通信网关 LLMNetworkClient
- [ ] **目标**：替代原来耦合在组件里硬编码的 SSE 发起，处理 AbortController 生命管理。
- [ ] **任务描述**：封装为 `src/services/LLMClient.ts`，暴露 `streamCompletion` 方法。允许透传模型字面的配置；接受上层随时调用中途打断流执行的打断命令机制。
- **优先级**：P0

### Phase 1: 画布基础能力补齐

#### [Task 1.1] 节点自由拉伸适配 `<NodeResizer>`
- [ ] **目标**：告别内容撑开 DOM 的旧排版，转为用户自定义宽高控制以应对上千字单节点。
- [ ] **任务描述**：在 `UserInputNode` 及 `LLMResponseNode` 组件上，接入 `reactflow` 自带的 `NodeResizer`。监听 Resize 回调，并将 `width` `height` Update 存回 Zustand `data.measurements` 内保留。
- **前置依赖**：Task 0.2
- **风险**：旧版高度补偿逻辑（获取 DOM 高度自动排版连线位置）会失效崩溃，须顺带修复或改为自由连线坐标计算。
- **优先级**：P1

#### [Task 1.2] 创建非依赖的备忘录节点 SummaryNode
- [ ] **目标**：满足独立记录研究灵感，不污染全局上下文的诉求。
- [ ] **任务描述**：新增一个 Node 类别注册。该节点不支持/隐藏 Source&Target Handle，完全不具备连线能力；数据内容完全不参与 GraphContextBuilder。
- [ ] **验收标准**：可在画布任一空旷部位创建大块文本便利贴且其文字不会被随后的 LLM 生成引用。
- **优先级**：P2
- **并行**：可以与编排任务并行。

### Phase 2: 研究节点与智能编排扩展

#### [Task 2.1] 支持个体独立模型等设定挂载
- [ ] **目标**：为所有源头需求点提供特异的对话策略定制。
- [ ] **任务描述**：为 `UserInputNode` 增加配置项侧轴面板图标（或 Popover）。允许在此处覆盖：所选模型（下发到统一 Proxy 的 identifier）、开启/关闭 Tool calls（搜索模式）。
- [ ] **验收标准**：针对单个节点修改的 Config 不串门，能确切影响后续基于该节点触发的所有模型并发行为。
- **优先级**：P1

#### [Task 2.2] 拦截 Tool Calling 并重铸为可折叠展示容器 
- [ ] **目标**：兼容外部大模型的自主 Tool Call 输出与搜索响应返回，维持图谱本身清爽。
- [ ] **任务描述**：重构 `LLMResponseNode` 中的 Markdown 渲染模块。一旦流解析获取到 `<thinking>` / `<search>` （或是 `tool_calls` JSON对象）等特定区域元字符结构，自动将其剥离丢入折叠组件（Details）容器中，在主文本框之上方进行呈现。
- **优先级**：P1

#### [Task 2.3] 引入断联取消 (Abort) 与遗留节点阻断能力
- [ ] **目标**：防止多米诺报错、无限制消耗网络连接；实现修改节点后的分支终止保护。
- [ ] **任务描述**：UI 增加浮动的全局“停止”图标。被触发时，清空 Zustand 内待请求生成队列，阻断当前唯一的网络 Socket。重点：已被推入流一半的数据调用 `done`；处于队尾因取消未获得重生的后代节点**绝对不可抹除**历史文字。
- [ ] **同步测试任务 (TDD)**：利用 `Mock Service Worker (MSW)` 设置延迟拦截，用代码模拟点击 Abort 后断言排队节点维持旧文本的状态。
- [ ] **验收标准**：网线被拔，队列切断，老旧的孙子世代文字保留。

#### [Task 2.4] Token 安全用量标尺与 60% 限额警报触发机制
- [ ] **目标**：严死防范图拓扑在演变中无故突破单次传输 Token 极值炸服。
- [ ] **任务描述**：在 Context Builder 完成拼接时引入廉价估算（如 1 中文汉字=2 Token 近似）。单条继承线的 Token 值达到全局常量最大配置上限值的 60% 时，将该连线的底部生成节点高亮发出警报要求截断。
- **优先级**：P0 (Spec强要求防崩溃机制)

### Phase 3: 多画布与持久化

#### [Task 3.1] Dexie.js (IndexedDB) 本地数据库架构铺设
- [ ] **目标**：彻底告别“重开机就没”的恶性体验。
- [ ] **任务描述**：引入并定义 `db.sessions`, `db.nodes`, `db.edges` 三张表结构。对 Zustand Store 写入 Subscribe 监听，做 debounce(500ms) 全局存盘动作。
- [ ] **同步测试任务 (TDD)**：引入 `fake-indexeddb` 建立集成测试。脱管试图强制通过 Zustand Action 高频更新节点 30 次，断言本地防抖调度机制未发生吞数据错误并落盘精准。

#### [Task 3.2] 会话选择器与状态快照恢复 (Hydration)
- [ ] **目标**：满足工作台上存在无数分项子工程。
- [ ] **任务描述**：侧边栏 UI，支持新建、切换（Select Active ID）、删除不同主题库。切换时调用 Dexie load 清空 Zustand 并重新填装对象与触发画布 CenterView。

### Phase 4: 导出与研究闭环补齐

#### [Task 4.1] 落跑“未对齐异常 (Stale)”高亮遮罩
- [ ] **目标**：避免用户因截断重发保留了旧文本而形成严重的错置知识点引用（张冠李戴）。
- [ ] **任务描述**：在触发中等取消动作时，找到没被刷新到的所有下游直系血亲并将它们的 `data.metadata.isStale` 给定 `true` 参数。节点组件在遇到 `isStale` 为 `true` 时，边框泛红并右上角醒目标签提醒“此内容已脱离当前上家链路（需重新生成进行对齐）”。
- [ ] **同步测试任务 (TDD)**：结合上游的 Abort 控制器编排 E2E 链条，立刻渲染该视图组件并利用 Testing Library 查询挂有 `Stale Alert` Class 的 DOM 元素是否精准命中且没有误伤同辈无关节点。

#### [Task 4.2] 单向链路平铺 Markdown 反推导出
- [ ] **目标**：最终的研究产出物萃取。
- [ ] **任务描述**：暴露右键菜单【单线导出 Markdown】。利用已有的 Graph Context Builder 从此末端向源头递归提取上下文 Array。利用脚本格式化拼接出标准文件：`## User...\n\n### Assistant...`，主动弹窗下发供浏览器下载。

#### [Task 4.3] 系统级 JSON 工程备份导入/导出方案
- [ ] **目标**：规避浏览器强力无痕清场带来的毁灭代价。
- [ ] **任务描述**：在侧边栏系统菜单处放置 【Save local project（工程全库快照导出）】。一键吐出整个图与全部 session 序列化格式文件（如 `.gc_project` JSON）。反向也提供读取并覆写。

### Phase 5: 发布总回归与容灾建设

*(注：各项核心功能的单测、集成测试及关键 E2E 均强推 **测试驱动开发 (TDD) **与业务交付同吃同住。因此 Phase 5 将全员转向大网收拢的极端手工测试与保障基建)*

#### [Task 5.1] 整体验收与超重度探索性测试 (Manual E2E)
- [ ] **目标**：以科研人员身份实际走通全套分支链路推演。全手工无情验收跨度极大视口下的自由缩放平移、级联中断、以及手动双导本地工程树（JSON/.md）的过程是否发生浏览器溢出性坠毁。

#### [Task 5.2] 环境变量体系配置与容灾兜底
- 对 `OpenRouter` Endpoint 准备独立配置读取，完善 Error Boundary 接管 `fetch` 超时崩溃导致的组件级白屏（退回报错卡片视图并引导用户重新按发起键）。

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
