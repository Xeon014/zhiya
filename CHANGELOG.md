# Changelog

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.23.0] - 2026-10-13

### Changed

- 选中主题：移除深色浮动迷你条；子级改为节点外侧「+」钮，同级/备注/删除在状态栏（移动端为底栏）

## [1.22.0] - 2026-10-13

### Added

- 移动端：安全区（刘海/底栏）、侧栏遮罩、底部 sheet 式右键菜单、备注面板键盘避让（`visualViewport`）
- 版本：构建注入 `__APP_VERSION__`，状态栏显示；导出 metadata `creator` 为 Zhiya + 应用版本

### Changed

- 窄屏隐藏顶栏撤销/重做，结构引擎下拉自适应宽度

## [1.21.0] - 2026-10-13

### 基线（移动端适配前）

- Xmind v25 兼容思维导图：27 结构引擎、标记/概要/联系/自由主题等
- REA 对齐：外框 `boundaries[]`、骨架 extension、roundedElbow 连线等（v1.21 功能集）
- 绿色便携包与 GitHub Pages / 自定义域在线部署（`www.hoven.zone/zhiya/`）
- 触屏基础：捏合缩放、长按菜单、双击编辑（`gestures.ts` / `view.ts`）
