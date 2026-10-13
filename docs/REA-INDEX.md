# REA 逆向产物索引（枝桠）

本地 REA 工作目录（默认）：`C:\Users\x5che\AppData\Local\Temp\zhiya-rea`

| 文件/目录 | 用途 |
|-----------|------|
| `xmind-app.json` | REA 全量分析证据（勿提交 git） |
| `summary.json` | 分析摘要视图 |
| `xmind-focus/renderer/1857.js` | 文档反序列化、布局引擎版本、主题/样式 |
| `xmind-focus/renderer/3310.js` | manifest / file-entries 常量 |
| `snippets*.txt` | 人工定位的代码窗 |
| `templates/` | 官方骨架 `content.json`（已复制到 `test/fixtures/xmind-templates/`） |

## 枝桠源码对照

| Xmind 概念 | 枝桠模块 |
|------------|----------|
| content.json 读写 | `src/model.ts`, `src/exports.ts`, `src/zip.ts` |
| branchConnection | `src/edges.ts`, `src/model.ts` |
| boundaries / summaries | `src/overlays.ts`, `src/model.ts` |
| skeleton.structure.style | `Sheet.skeletonStyle` |
| 加密 manifest | `exports.openBuffer` 检测 |

打包 fixture 为 `.xmind`：`npm run fixtures:pack`
