# 枝桠 Zhiya —— 技术总结与交接文档

> 本文档面向后续开发者/编程 Agent，覆盖：Xmind 逆向发现、架构设计、功能清单、测试体系、开发工作流。
> 产物形态：单文件 HTML（约 115 KB），零运行时依赖，TypeScript 工程（Vite 构建）；PWA manifest 以 data-URI 内嵌，仍为单文件。

---

## 一、Xmind 逆向研究摘要

### 研究方法

| 步骤 | 工具 | 产出 |
|---|---|---|
| REA 分析 app.asar | `rea analyze-javascript-application` | 152 MB Evidence JSON，10102 文件图谱 |
| webpack 5 拆包 | 自研 `split-webpack.mjs` 脚本 | 288 个独立模块（数字 ID，无 source map） |
| js-beautify 格式化 | `npx js-beautify` | 可读代码，定位到行号 |
| 关键词定位 | grep 词频 + 上下文阅读 | 逆向出各子系统的精确实现 |

### Xmind 代码结构（v25.04, vana_win32）

| 分包 | 大小 | 职责 |
|---|---|---|
| `main/main.bytecode` | 3.9 MB | 主进程 V8 字节码（不可静态分析） |
| `renderer/4654.js` | 3.7 MB | 编辑器核心（模块 24654 单体 1.88 MB） |
| `renderer/4666.js` | 8.8 MB | SVG 渲染引擎（svg ×13173 处） |
| `renderer/2118.js` | 650 KB | 幻灯片/演示布局（121 模块） |
| `renderer/4245.js` | 517 KB | .xmind 文件读写 |

### 逆向发现 → 枝桠设计对照

| Xmind 发现 | 证据位置 | 枝桠实现 |
|---|---|---|
| **结构引擎插件注册表** `layoutVariantEngines`（18 变体） | 2118.js → pretty/41992.js | `StructureEngines` 注册表，4 引擎共用接口 |
| **生长方向决策** `layoutFactors.primaryGrowthDirection` | 24654.js L10296 区 | `growthSplit()`：子树高度最小化双侧切分 |
| **注入式测量** `measureText / measureImage / loadFont` 外部注入 | 24654.js L6134 | `MeasureCtx.sizeOf()` 注入真实 DOM 度量 |
| **形状系统** 43 种 `org.xmind.topicShape.*`（实测去重，含 ellipticrectangle 别名） | 4654.js 全局搜索（43 枚举值逐一核对） | **全量移植 43 种**：shapes.ts 统一注册表，归一化点表三渲染器共用 |
| **样式属性键** `shape-class`(×340) `svg:fill`(×112) `line-color` `font-color` | 4654.js 枚举定义 | `style.properties` 存储结构完全一致，Xmind 可读 |
| **连线类** 8 种 `org.xmind.branchConnection.*` | 4654.js 全局搜索 | 移植 6 种：curve/straight/elbow/fold/bight/brace |
| **主题预设** `{theme:{centralTopic:{properties:{...}}}}` 按角色分层 | 4654.js JSON.parse 内置主题 | 4 预设（经典/商务/手绘/霓虹），CSS 变量 + 角色默认值 |
| **备注** `notes.plain.content` + `notesDisplay: Block` 块显示 | 24654.js L11785 `zu()` 函数 | 同构：note 字段 + `.t-note` 块显示（≤5 行）+ 黄底角标 |
| **概要** 双结构：父主题 `summaries:[{id, range:"(0,1)", topicId}]` + `children.summary:[{id,title}]` 独立概要 topic；范围拖拽 `asMovable().move()` | 24654.js L17596-17601；官方模板 how_to_take_note_efficiently.xmind 的 content.json 实测 | 同构序列化（range 元组 + topicId + children.summary）；概要标签 DOM 化可双击改名，括号端点 handle 拖拽调范围（吸附兄弟槽位） |
| **外框** `boundaries` + `boundaryFigureByBoundaryId` | 4654.js boundary 键 | `Topic.boundary` 布尔标记，虚线框覆盖层 |
| **多画布** `sheets[]` 数组，每张独立 structureClass/themeClass | content.json 格式 | `sheets: Sheet[]`，标签栏切换/新建/删除 |
| **.xmind 文件格式** ZIP 容器 + content.json + manifest.json + metadata.json | 4245.js 常量与校验 | 零依赖 ZIP 写入（store）+ 读取（store/deflate） |
| **连接线** 三次贝塞尔 `[{moveTo},{lineTo}]` 路径段系统 | 24654.js org-chart 引擎 | SVG `<path>` + 分支功能色 |
| **触屏手势** pointer 事件数组 + `gestureSession` 状态机 + GestureEvent 桥接 | 24654.js L4261 / L5782 / L5152 | `gestures.ts` 纯函数手势数学（pinchTransform 锚点保持）+ 长按/双击触摸会话；view.ts 双指捏合指针会话 |
| **成长方向** `growthDirection`（×344）+ `primaryGrowthDirection/secondaryGrowthDirection/passiveGrowthDirectionForEachChildTopic` 布局因子；结构类 `logic-chart[.right/.left]`、`logic.right/left` | 24654.js L9027；4654.js 枚举；官方模板 content.json 实测 | logic 引擎家族 3 引擎（平衡/向右/向左）；分支级 `Topic.side` 覆盖（右键菜单"分支方向"）；导出写 Xmind 全类名、导入规范化（含近亲变体映射） |
| **标记** `"markers":[{"markerId":"priority-1"}]`，id 族 priority-N/flag-色/star-色/people-色/task-*/symbol-*/smiley-* | 官方模板 content.json 实测 | `Topic.markers[]` 同构；7 组 37 徽章（markers.ts），侧栏样式页切换，PNG/SVG 导出一致 |
| **联系** sheet 级 `relationships:[{id, end1Id, end2Id, title?, controlPoints, style.arrow-end-class}]` | 官方模板实测 | `Sheet.relationships[]`；右键"添加联系到…"拾取创建，曲线+矛形箭头，标签 DOM 可双击改名，命中线右键删除 |
| **自由主题** `children.detached:[{id, position:{x,y}}]` + `topicPositioning:"fixed"`；独立 structureClass | 官方模板实测 | `Topic.detachedKids[] + pos`；画布右键插入/拖主题到空白自动转自由/自由拖动/拖回主题重新挂接；子树以 logic 单侧在落点展开 |
| **演示模式** 幻灯片/演示布局子系统 | 2118.js（121 模块） | `present.ts` 逐分支步进聚焦（淡化非当前分支 + 包围盒缩放居中） |
| **标签/链接/图片/附件/标注** `labels:["…"]` 字符串数组、`href:"https://…"`、`image:{src:"xap:resources/<hash>.png",w,h,align}`、附件 `href:"xap:attachments/<name>"`、`children.calloutTopics` | 官方模板 content.json 实测 + 4245.js 解析器（xap: 前缀判定） | 全部同构实现：labels 芯片、href 角标（自动补协议、📎/🔗 区分）、图片 dataURL↔xap:resources 双向转换（.xmind 导出嵌入/导入解析）、附件 IndexedDB 持久仓 + ZIP 嵌入 + 保存时未引用 GC（复刻 4245 语义）、callout 通道复用自由主题机制 |

---

### v1.19 审计修复记录（马拉松发现）

| Bug | 根因 | 修复 |
|---|---|---|
| 撤销后刷新回滚失效 | `restoreSnapshot` 不触发 autosave | undo/redo 后立即 autosave |
| 撤销主题/切画布后界面不恢复 | 模型 themeClass/structureClass 与 CSS 变量、引擎下拉不同步 | relayout 检测双 class 变化 → 自动 applyTheme + 同步 select（覆盖撤销/导入/切画布全部恢复路径） |
| 撤销到底与初始存档不等价 | boot 中 pushHistory 先于 relayout（主题角色默认值未入栈底快照） | 调整 boot 顺序：先布局后入栈 |
| 窗格尺寸变化后视图不适配 | ① 无任何尺寸监听；② 内嵌 webview 容器变化不派发 window resize | view.ts 防抖 250ms 双通道适配：window resize + **ResizeObserver 观察 #viewport**；适应缩放与当前差逾三成→自动适应，轻微变化→保持缩放温和居中 |
| **折叠分支再展开后子主题叠在一起**（用户实测报告，v1.19.3 根修） | `relayout` 中 `measure`（读 offsetHeight）先于 display 恢复执行——折叠过的主题 `display:none` 下 offsetHeight=0，heights 表污染为 0，展开后兄弟行按 0 高堆叠（间距塌成 14px） | 将可见性恢复循环移到 measure **之前**；verify 步骤 6b 增加展开后间距回归断言 |

## 二、架构设计

### 模块依赖图

```
main.ts（入口，键盘+工具栏+触屏手势接线）
  ├── shapes.ts（43 形状注册表：点表/特例/padding 系数，三渲染器唯一几何源）
  ├── gestures.ts（手势纯函数 pinchTransform/长按/双击 + 触摸会话监听）
  ├── markers.ts（标记注册表：7 组 37 徽章，DOM/canvas/SVG 三渲染一致）
  ├── relationships.ts（联系：曲线渲染 + 拾取创建 + 标签编辑 + 命中菜单）
  ├── find.ts / findcore.ts（查找替换 UI + 纯函数匹配，Ctrl+F）
  ├── present.ts（ZEN 演示模式：逐分支步进聚焦，F5）
  ├── ooxml.ts（docx/xlsx/pptx/textbundle 零依赖生成器）
  ├── zip.ts（零依赖 ZIP 读写纯函数，供 exports/ooxml 共用）
  ├── assets.ts（图片源缓存 + 附件字节仓：历史/快照不进二进制）
  ├── media.ts（图片/附件文件输入处理）
  ├── linkpanel.ts（链接设置面板）
  ├── boot.ts（种子导图 + init）
  ├── model.ts（Topic/Sheet/序列化/多画布管理）
  │     └── engines.ts（4 结构引擎 + 注册表）
  ├── figures.ts（Figure 图层：DOM 创建/更新/事件绑定）
  │     └── dom.ts（DOM 元素集中引用）
  ├── layout.ts（布局编排 + 230ms 补间动画 + 覆盖层集成）
  │     ├── edges.ts（6 种连线形状生成器 + 4 主题预设）
  │     └── overlays.ts（外框包围盒 + 概要花括号 + 画布标签栏）
  ├── interactions.ts（选中/编辑/增删/折叠/导航）
  ├── dragdrop.ts（三态拖拽：前插/后插/换父）
  ├── notes.ts（锚定备注弹层 + 块显示实时更新）
  ├── menus.ts（右键上下文菜单 + 文件/导出下拉）
  ├── sidebar.ts（大纲/笔记/样式/快捷键 四页签）
  ├── minibar.ts（选中主题迷你工具条）
  ├── view.ts（平移/缩放/适应画布）
  ├── persistence.ts（120 步快照撤销 + localStorage 自动保存）
  ├── exports.ts（.xmind ZIP + PNG + SVG + Markdown + OPML + FreeMind + 文本 + PDF）
  └── ui.ts（toast + 状态栏 + 工具条可用性）
```

### 核心设计决策

| 决策 | 原因 |
|---|---|
| Figure 桥接模式 | Model（纯数据）与 DOM 分离，`figureMap` 维护 id→元素映射 |
| 注入式测量 | 布局引擎不直接访问 DOM，通过 `ctx.sizeOf()` 注入（复刻 Xmind） |
| 单文件产物 | `vite-plugin-singlefile`，开发用模块，构建产物仍是一个 HTML |
| ESM 循环引用 | 模块间函数级循环引用在运行期安全（函数声明提升） |
| 快照式撤销 | `JSON.stringify(toJSON())` 存栈，简单可靠，120 步上限 |
| CSS 变量主题 | 主题切换改 `--paper`/`--ink` 等变量，即时生效无需重渲染 |

### 已修复的关键 Bug（开发中踩过的坑）

| Bug | 根因 | 修复 |
|---|---|---|
| SVG 层拦截点击 | `#edges` 覆盖在主题上方 | `pointer-events: none` |
| Map 下标访问崩溃 | `posNow[id]` 应为 `.get(id)` | TypeScript 编译期拦截 |
| 首次测量 1 字宽列 | `#world` 宽度为 0 → shrink-to-fit 可用宽度为负 | `width: max-content` |
| className 重建丢形状类 | strip 正则不含 `shape-*` | 保留 shape 类匹配 |
| 动画取消不更新 `f.cur` | `token !== animToken` 时直接 return | 取消时跳到终态 + `f.cur` 立即设为目标 |
| 画布菜单"自闪" | window 关闭器关掉刚打开的菜单 | `stopPropagation()` |
| 备注撤销丢数据 | 输入时无历史锚点，撤销跳过改前状态 | 改前/改后成对入栈 |

---

## 三、功能清单

### 结构引擎（27 个，注册表插件化）

| 引擎 | ID | 布局算法 | 连线 |
|---|---|---|---|
| 思维导图 | `logic-chart` | 双侧平衡生长（子树高度最小化切分，尊重分支级方向覆盖） | 贝塞尔曲线 |
| 逻辑图 · 向右 | `logic-right` | 全部一级分支在右侧（`org.xmind.ui.logic-chart.right`） | 贝塞尔曲线 |
| 逻辑图 · 向左 | `logic-left` | 全部一级分支在左侧（镜像） | 贝塞尔曲线 |
| 发散图 · 非平衡 | `map-unbalanced` | 默认单侧 + 分支级方向覆盖（`org.xmind.ui.map.unbalanced`） | 贝塞尔曲线 |
| 发散图 · 顺时针 | `map-clockwise` | 一级分支按子树高度分配扇区角度，极坐标辐射 | 辐射直线 |
| 发散图 · 逆时针 | `map-anticlockwise` | 镜像 | 辐射直线 |
| 组织架构 · 向上 | `org-chart-up` | 向上生长（`org-chart.up` 镜像） | 垂直贝塞尔 |
| 鱼骨图 · 右头 | `fishbone-right` | 脊骨向左（`fishbone.rightHeaded` 镜像） | 斜线+水平 |
| 时间轴 · 竖向 | `timeline-vertical` | 竖轴 + 事件左右交替 | 竖线+水平 |
| 时间轴 · 反向/单侧/单侧反向 | `timeline-rtl` / `timeline-sided` / `timeline-sided-rtl` | 轴向镜像 / 事件固定单侧 | 同上 |
| 时间轴 · 竖向自下而上 | `timeline-vertical-btt` | 竖轴镜像 | 竖线+水平 |
| 时间轴 · 贯通（自下而上） | `timeline-through` / `timeline-through-btt` | 主题串在轴上 | 轴线贯穿 |
| 树图 · 向右/向左 | `tree-right/left` | 大纲式单侧堆叠（子块自父主题顶展开） | 直角折线 |
| 括号图 · 向右/向左 | `brace-right/left` | logic 排布 + 花括号聚合连线 | 花括号+引线 |
| 树表格（顶标题） | `treetable` / `treetable-toptitle` | 行组 = 一级分支、按深度缩进、行分隔线 | 表格线 |
| 矩阵 | `grid` | 列头一级/行按序号跨列对齐、斑马行 | 网格线 |
| 电子表格（行头） | `spreadsheet` / `spreadsheet-column` | 同矩阵机制，column 为转置（行头在左） | 网格线 |
| 组织架构 | `org-chart` | 向下生长，行内水平展开 | 垂直贝塞尔 |
| 鱼骨图 | `fishbone` | 脊骨 + 上下交替 45° 斜刺 | 斜线+水平 |
| 时间轴 | `timeline` | 水平轴线 + 上下交替事件 | 竖线+水平 |

### 主题样式系统

| 层 | 内容 | 存储 |
|---|---|---|
| 形状 | **43 种全量**（Xmind 枚举逐一移植：基础/流程图/括号引号/趣味四组，含 ellipticrectangle 别名） | `style.properties["shape-class"]` |
| 标记 | 7 组 37 徽章（优先级/任务/旗帜/星/人物/符号/表情），可多选 | `markers[{markerId}]` |
| 颜色 | 填充/文字/线条三组调色板 | `svg:fill` / `font-color` / `line-color` |
| 连线 | 6 种（curve/straight/elbow/fold/bight/brace） | `line-class` |
| 主题 | **47 款**（4 内置 + 43 Xmind 官方移植 + 自定义导入） | `sheet.themeClass` |

### 视觉覆盖层

| 功能 | 操作 | 渲染 |
|---|---|---|
| 外框 | 右键 → 添加外框 | 虚线圆角矩形（子树包围盒） |
| 概要 | 右键 → 添加概要 | 花括号路径 + 概要标签（DOM，Xmind 一等节点） |
| 概要改名 | **双击概要标签** | 原地 contenteditable 编辑 |
| 概要调范围 | **拖拽括号上下端 handle** | 吸附最近同侧兄弟槽位，实时预览 |
| 概要删除 | 概要标签右键 → 删除概要 | — |

### 联系与自由主题（v1.11）

| 功能 | 操作 | 说明 |
|---|---|---|
| 联系·创建 | 右键主题 → 添加联系到… → 点击目标 | 拾取模式（Esc 取消），去重 |
| 联系·标签 | 双击虚线标签原地改名 | DOM 一等标签 |
| 联系·删除 | 右键联系线 | 命中区加宽 14px 便于点选 |
| 自由主题·插入 | 画布右键 → 插入自由主题 | 落点即 position |
| 自由主题·转换 | 拖任意主题到空白处（>40px） | 自动挂 detached 通道，子树跟随 |
| 自由主题·挂回 | 拖自由主题到普通主题上 | 回到自动布局 |
| 自由主题·移动 | 直接拖动 | position 实时更新 |

### 编辑器功能（v1.12）

| 功能 | 入口 | 说明 |
|---|---|---|
| 查找替换 | Ctrl+F | 标题+备注+标签命中、黄框高亮、Enter/Shift+Enter 步进、单处/全部替换（整体一步撤销） |
| 多选批量 | Ctrl+左键 | 加选/减选；Delete 批删、样式/标记批量应用、Ctrl+D 取消 |
| ZEN 演示 | F5 / 文件菜单 | 逐一级分支步进聚焦（其余淡化），→/空格/← 导航，Esc 退出 |
| 对齐参考线 | 拖自由主题 | 与其他主题中线/边线对齐（阈值 6px），吸附 + 虚线参考线 |

### 标签 · 链接 · 图片 · 附件 · 标注框（v1.13）

| 功能 | 入口 | 说明 |
|---|---|---|
| 标签 | 侧栏样式页 | 多芯片、回车添加、× 删除、多选批量；六色按文本哈希 |
| 链接 | 右键 → 设置链接… | 自动补协议；🔗 角标点击新页打开；历史快照不含 dataURL |
| 附件 | 右键 → 附加文件… | 📎 角标点击下载；字节仓 IndexedDB 持久化（重载存活），导出 .xmind 嵌入 attachments/，保存时未引用附件自动 GC |
| 图片 | 右键 → 插入图片… | 本地图片入主题（≤220px），导出 .xmind 转 xap:resources/ 嵌入，导入反向还原 |
| 标注框 | 画布右键 → 插入标注框 | calloutTopics 通道，气泡样式 + 尾巴，自由定位/拖拽/挂接同自由主题 |

### 图例与主题包（v1.16）

| 功能 | 入口 | 说明 |
|---|---|---|
| 图例 | 文件菜单 / 画布右键 | 可拖动浮层列出使用中的标记，双击编辑含义；`legend{visibility, position, markers}` 真实键；PNG/SVG 导出绘制 |
| 主题包 | 侧栏样式页 | **47 款**：4 内置 + 43 个 Xmind 官方主题移植（`static/styles/themes/*.json` 脚本转换）；暗色主题自动切透明主题背景；六支功能色按强调色色相旋转 |
| 主题导入/导出 | 侧栏 | Xmind 主题 JSON 双向兼容（导入官方主题文件 / 导出当前主题）；自定义主题存 localStorage |

### 多画布

| 操作 | 入口 |
|---|---|
| 切换 | 画布顶部标签栏点击 |
| 新建 | 标签栏 **+** 按钮 |
| 删除 | 标签栏 **×**（至少保留一张） |

### 交互

| 功能 | 快捷键 | 鼠标 |
|---|---|---|
| 添加子主题 | Tab | 右键菜单 / 迷你条 ⊕ |
| 添加同级 | Enter | 右键菜单 / 迷你条 ＋ |
| 重命名 | F2 | 双击 |
| 折叠/展开 | Space | 折叠指示器点击 |
| 删除 | Delete | 右键菜单 / 迷你条 ✕ |
| 导航 | ↑↓←→ | — |
| 撤销/重做 | Ctrl+Z / Ctrl+Y | 工具栏 ↶ ↷ |
| 笔记 | Ctrl+M | 角标点击 / 右键 / 迷你条 |
| 保存 | Ctrl+S | 文件菜单 |
| 拖拽调序 | — | 拖主题（三态放置） |
| 平移 | — | 拖空白区域 |
| 缩放 | 滚轮 | 右下角缩放簇 |
| 右键菜单 | — | 右键主题/画布 |
| 触屏·选中 | — | 单指 tap |
| 触屏·编辑 | — | 双击（双 tap） |
| 触屏·菜单 | — | 长按 500ms |
| 触屏·缩放 | — | 双指捏合（锚点保持） |
| 触屏·平移/拖拽 | — | 单指拖空白 / 拖主题（拖拽途中来第二指自动转捏合） |
| 分支方向 | — | 右键主题 → 分支方向 · 自动/向右/向左（logic 系结构） |

### 持久化与导出

| 格式 | 导出 | 导入 | 兼容性 |
|---|---|---|---|
| .xmind (ZIP) | ✔ | ✔ | Xmind 原生可开（notes/style 为真实键；summaries 为真实双结构：range 元组 + topicId + children.summary；structureClass 写全类名；markers/relationships/children.detached+position/topicPositioning 均为真实键） |
| PNG @2x | ✔ | — | System.Drawing 验证通过 |
| SVG 矢量 | ✔ | — | 颜色已解析，无 var() 残留 |
| Markdown | ✔ | — | 笔记变引用块 |
| OPML | ✔ | — | 含 `_note` 属性 |
| FreeMind (.mm) | ✔ | — | 含 POSITION/FOLDED/richcontent NOTE |
| 大纲文本 | ✔ | — | — |
| PDF | 经由打印 | — | 打印样式表就绪 |
| PWA 安装 | — | — | data-URI manifest（主题色/favicon/SVG 图标），Edge/Chrome 可安装为独立窗口应用；**不新增任何文件，产物仍是单 index.html** |
| Word (.docx) | ✔ | — | 零依赖 OOXML：标题分级 + 备注引文段 |
| Excel (.xlsx) | ✔ | — | 大纲表（层级/标题/备注/标记/形状） |
| PPT (.pptx) | ✔ | — | 每个一级分支一页（标题+要点），XML 良构校验 |
| TextBundle | ✔ | — | text.markdown + info.json |
| 分支导出 | ✔ | — | 右键主题：分支 .xmind / 分支 Markdown |
| PNG 水印 | ✔ | — | 导出菜单开关，斜向平铺半透明水印（文本=根标题） |
| localStorage | 自动（400ms 防抖） | 自动恢复 | 每浏览器独立 |
| 文件直写（File System Access API） | ✔（Edge/Chrome） | ✔（原生对话框） | 句柄直写磁盘，Ctrl+S 写回上次文件；.xmind 打开后可直接保存回原文件；不支持的浏览器自动回退下载流（webdriver 自动化环境亦走回退） |
| JSON | — | ✔ | 兼容自有与 Xmind 格式 |

---

## 四、测试体系

### 三层金字塔

| 层 | 命令 | 内容 | 耗时 |
|---|---|---|---|
| **单元测试** | `npm run test:unit` | 83 项（含表格系行列对齐/缩进/斑马行几何）：模型回路 / 引擎几何 / 样式序列化 / 连线生成 / 主题结构 / 多画布管理 / 概要（Xmind 真实键 + 旧格式兼容）/ 43 形状注册表 / 手势纯函数 | <1s |
| **几何断言** | `npm run test:verify` | 63 项（含表格系 5 引擎切引擎断言、表格线计数）：双侧平衡 / 无重叠 / 连接线数 / 折叠计数 / 三引擎切换 / 拖拽换父 / 概要改名 + handle 调范围 / 触屏会话（tap·双击·长按·双指捏合） | ~15s |
| **端到端** | `npm run test:e2e` | 47 项（含图片/附件 .xmind 嵌入字节校验）：增删改 / 撤销重做 / 笔记锚定 / 右键菜单 / 迷你条 / 侧栏 / 角标约束 / 全格式导出 / .xmind 回路 / 新形状三渲染器抽样 / 概要改名落盘与回路 | ~35s |
| **马拉松审计** | `npm run test:marathon` | 30 个 Xmind 官方模板全量导入 / 全特性撤销快照等价（9 类变更→14 次撤销→深等价）/ 损坏·空存档启动降级 / 120 主题性能 / 暗色主题导出 | ~90s |
| **启动器冒烟** | `npm run test:launcher` | 起 PowerShell 服务 → HTTP 200 + 完整内容 + 目录穿越 404 → 清理 | ~10s |

### 运行完整测试链

```bash
cd zhiya && npm test
# 等效于: build → tsc → vitest → verify → e2e
```

### 测试技术栈

- **马拉松审计**（v1.19）：官方模板全量导入是真实世界兼容性的最强回归——30 个模板含全部结构家族与多画布/标记/联系等特性组合
- **vitest**：单元测试（无 DOM，纯函数测试）
- **PowerShell XmlDocument**：导出的 docx/xlsx/pptx 解包后逐 XML 良构校验（test/validate-ooxml.ps1）
- **playwright-core + Edge headless**：E2E + 几何断言（真实浏览器）
- 断言方式：DOM classList / dataset / getBoundingClientRect / SVG path 内容 / 下载文件字节验证

### 已验证的第三方交叉校验

- Windows `Expand-Archive` 解压导出的 .xmind → 验证 ZIP 结构 + content.json 有效
- .NET `System.Drawing` 解码导出的 PNG → 验证图片格式 + 尺寸

---

## 五、开发工作流

```bash
cd zhiya

npm install          # 首次
npm run dev          # 开发服务器（热更新，http://localhost:5173）
npm run check        # TypeScript 类型检查（strict + noUncheckedIndexedAccess）
npm run build        # 构建单文件 → dist/index.html（~70 KB）
npm test             # 完整测试链
```

### 代码规范

- TypeScript strict 模式 + `noUncheckedIndexedAccess`
- 模块间允许函数级循环引用（运行期安全）
- 所有可变全局状态集中在 `model.ts`（`let sheet/sheets/selectedId`，仅本模块可重绑定）
- DOM 元素引用集中在 `dom.ts`（类型安全 `$<T>()` 获取）
- 撤销操作：任何模型变更后必须调用 `pushHistory()`

### 新增功能指南

**添加新结构引擎：**
1. 在 `engines.ts` 实现 `StructureEngine` 接口（measure/arrange/edgePath/chevronAt）
2. 调用 `registerEngine({id, label, ...})`
3. 自动出现在工具栏下拉中，无需额外接线

**添加新导出格式：**
1. 在 `exports.ts` 添加格式转换函数
2. 在 `doExport` switch 中添加 case
3. 在 `main.ts` 的导出菜单中添加条目

**添加新右键菜单项：**
1. 在 `menus.ts` 的 `topicMenu()` 或 `canvasMenu()` 中添加 `{label, action}` 条目

---

## 六、已知限制与后续方向

### 当前限制

| 限制 | 说明 |
|---|---|
| 外框样式单一 | 仅虚线圆角矩形，无 Xmind 的多种外框样式（Xmind 的 boundary 同样带 rangeStart/rangeEnd，可按概要同款 handle 方式扩展） |
| 曲线形状为多点近似 | 心形/云形/水滴等曲线形状用约 16 点归一化多边形近似（clip-path 兼容），非贝塞尔矢量 |
| 附件持久化依赖 IndexedDB | file:// 直开等 IDB 不可用环境自动降级为会话级；清除站点数据会清空附件仓 |
| 无协作/同步 | 单用户单浏览器，localStorage 不跨设备 |
| 主进程未实现 | 无 Electron 壳，无原生文件对话框/文件关联 |

### 建议迭代方向

| 优先级 | 方向 | 预估 |
|---|---|---|
| 中 | 主题自定义（用户自建主题保存/加载） | 一天 |
| 低 | 查找替换 / 多选批量 / ZEN 演示模式（2118.js 幻灯片模块） / Word·PPT·Excel 导出 | 各一天起 |
| 中 | Markdown 反向导入（解析为导图） | 半天 |
| 低 | Electron/Tauri 壳（原生文件对话框 + .xmind 关联） | 一天 |
| 低 | 协作（WebSocket + CRDT 冲突解决） | 一周+ |
| 低 | 语音备注（Web Audio API 录音 + 波形显示） | 一天 |

---

## 七、项目产物清单

| 文件 | 说明 |
|---|---|
| `dist/index.html` | **最终交付物**：单文件，约 90 KB，双击即用 |
| `src/` | TypeScript 源码（27 模块；v1.12 新增 find/findcore/present/ooxml/zip） |
| `test/unit.test.ts` | vitest 单元测试（29 项） |
| `test/verify.mjs` | 几何断言（16 项，Playwright + Edge） |
| `test/e2e.mjs` | 端到端测试（28 项，Playwright + Edge） |
| `package.json` | 依赖与脚本 |
| `release/` | **用户交付物（绿色便携包）**：`npm run release` 生成 `枝桠-v{版本}.zip`（枝桠.html + 启动枝桠.bat + zhiya-server.ps1 + 启动枝桠.command + 使用说明.md） |
| `scripts/launcher/` | 便携包启动器：PowerShell HttpListener（127.0.0.1 动态端口、白名单防穿越、ps1 需 UTF-8 BOM）+ bat 入口 + mac/Linux command |
| `使用说明.md` / `README.md` | 用户指南（三种使用方式/数据说明/快捷键速查）与仓库门面 |
| `test/marathon.mjs` | 马拉松审计 |
| `scripts/make-release.mjs` | 交付物打包脚本 |
| `vite.config.ts` | Vite 配置（singlefile 插件） |
| `tsconfig.json` | TypeScript 配置（strict） |
