# 版本管理

## 单一来源

- **应用版本**：`package.json` 的 `version` 字段（当前主线版本号）
- **构建注入**：Vite `define` → `__APP_VERSION__`，界面状态栏展示
- **便携包**：`npm run release` → `release/枝桠-v{version}.zip`
- **Git 标签**：发版时 `git tag v{version}`，与 CHANGELOG 条目对应

## 发版检查清单

1. 修改 `package.json` 的 `version`（语义化版本）
2. 更新 `CHANGELOG.md`
3. `npm test`
4. `npm run build`（可选 `npm run release` 打 zip）
5. 提交：`git commit -m "release: vX.Y.Z"`
6. 打标签：`git tag -a vX.Y.Z -m "vX.Y.Z"`
7. 推送：`git push origin main --tags`
8. GitHub Pages 在推送 `main` 后自动部署（`.github/workflows/pages.yml`）

## 已发布标签

| 标签 | 说明 |
|------|------|
| `v1.21.0` | 移动端适配前的功能基线 |
| `v1.22.0` | 移动端 P0 + 应用内版本展示 |

## 与 Xmind 导出 metadata 的区别

导出 `.xmind` 时 `metadata.json` 中的 `creator` 字段用于 **Xmind 客户端兼容**；枝桠自身版本见界面与 `package.json`，二者用途不同。
