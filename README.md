# 枝桠 Zhiya

> 逆向 Xmind 复刻的单文件思维导图。TypeScript 工程，产物一个 HTML（~115KB），零运行时依赖，`.xmind` 双向兼容。

**用户请看 [使用说明.md](使用说明.md)**——`npm run release` 产出绿色便携包 zip，解压后双击「启动枝桠.bat」即用（完整功能：附件持久 / 原生保存 / 可装 PWA）。

**在线体验（GitHub Pages）**：<https://www.hoven.zone/zhiya/>（仓库：<https://github.com/Xeon014/zhiya>；推送 `main` 由 Actions 部署；导图数据仍在访客浏览器本地，无云端账号）。

## 快速开始（开发者）

```bash
npm install
npm run dev        # 开发服务器 http://localhost:5173
npm run build      # 构建单文件 → dist/index.html
npm test           # 完整测试链：build → tsc → 单元(95) → 几何 → E2E → 马拉松(fixture) → 启动器
npm run release    # 打包用户交付物 → release/枝桠-v{版本}.zip（HTML + 使用说明）
```

## 这是什么项目

对 Xmind (v25.04) 做逆向工程研究（REA 分析 app.asar → webpack 拆包 → 定位子系统），然后**按其真实数据格式复刻**的思维导图工具。目前的对齐程度：

| 维度 | 覆盖 |
|---|---|
| 结构引擎 | 27 个（思维导图/逻辑图/发散图×3/组织架构×2/鱼骨×2/时间轴全系 8 种/树图/括号图/树表格/矩阵/电子表格×2 等），Xmind 全类名双向映射 |
| 形状 / 连线 / 主题 | 43 种形状（全量）/ 6 种连线 / 47 款主题（43 款移植自 Xmind 官方） |
| 数据模型 | 备注 / 标记 / 标签 / 链接 / 图片 / 附件（IndexedDB 持久）/ 概要 / 外框 / 联系 / 自由主题 / 标注框 / 图例 / 多画布——全部为 `.xmind` 真实键 |
| 编辑器 | 查找替换 / 多选批量 / ZEN 演示 / 对齐参考线 / 触屏全套（双指缩放·长按·双击）/ 120 步撤销 |
| 导出 | PNG(水印) / SVG / Markdown / OPML / FreeMind / **Word·Excel·PPT（零依赖 OOXML）** / TextBundle / 分支导出 / PDF |
| 桌面体验 | File System Access API（原生对话框+直写+回退）/ PWA（data-URI manifest，不破坏单文件） |

## 测试体系

五层金字塔，`npm test` 一条命令：单元（vitest 83 项）→ 几何断言（Playwright 真实浏览器 63 项）→ E2E（47 项检查）→ **马拉松审计**（30 个 Xmind 官方模板全量导入、全特性撤销快照等价、损坏/空存档启动、120 主题性能、暗色主题导出）。

## 更多

架构设计、逆向证据对照表、功能清单与已知限制：见 [HANDOFF.md](HANDOFF.md)。
