# -*- coding: utf-8 -*-
# 一次性脚本：HANDOFF.md 增补成长方向功能（v1.10）
import io
p = 'HANDOFF.md'
s = io.open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert old in s, 'NOT FOUND: ' + old[:60]
    s = s.replace(old, new)

# 1. 逆向对照表加一行
rep('| **触屏手势** pointer 事件数组 + `gestureSession` 状态机 + GestureEvent 桥接 | 24654.js L4261 / L5782 / L5152 | `gestures.ts` 纯函数手势数学（pinchTransform 锚点保持）+ 长按/双击会话；view.ts 双指捏合指针会话 |',
    '''| **触屏手势** pointer 事件数组 + `gestureSession` 状态机 + GestureEvent 桥接 | 24654.js L4261 / L5782 / L5152 | `gestures.ts` 纯函数手势数学（pinchTransform 锚点保持）+ 长按/双击会话；view.ts 双指捏合指针会话 |
| **成长方向** `growthDirection`（×344）+ `primaryGrowthDirection/secondaryGrowthDirection/passiveGrowthDirectionForEachChildTopic` 布局因子；结构类 `logic-chart[.right/.left]`、`logic.right/left` | 24654.js L9027；4654.js 枚举；官方模板 content.json 实测 | logic 引擎家族 3 引擎（平衡/向右/向左）；分支级 `Topic.side` 覆盖（右键菜单"分支方向"）；导出写 Xmind 全类名、导入规范化（含近亲变体映射） |''')

# 2. 引擎表 4 → 6
rep('''| 引擎 | ID | 布局算法 | 连线 |
|---|---|---|---|
| 思维导图 | `logic-chart` | 双侧平衡生长（子树高度最小化切分） | 贝塞尔曲线 |''',
    '''| 引擎 | ID | 布局算法 | 连线 |
|---|---|---|---|
| 思维导图 | `logic-chart` | 双侧平衡生长（子树高度最小化切分，尊重分支级方向覆盖） | 贝塞尔曲线 |
| 逻辑图 · 向右 | `logic-right` | 全部一级分支在右侧（`org.xmind.ui.logic-chart.right`） | 贝塞尔曲线 |
| 逻辑图 · 向左 | `logic-left` | 全部一级分支在左侧（镜像） | 贝塞尔曲线 |''')

# 3. 结构引擎节标题 4 → 6
rep('### 结构引擎（4 个，注册表插件化）', '### 结构引擎（6 个，注册表插件化）')

# 4. 交互表补分支方向
rep('| 触屏·平移/拖拽 | — | 单指拖空白 / 拖主题（拖拽途中来第二指自动转捏合） |',
    '''| 触屏·平移/拖拽 | — | 单指拖空白 / 拖主题（拖拽途中来第二指自动转捏合） |
| 分支方向 | — | 右键主题 → 分支方向 · 自动/向右/向左（logic 系结构） |''')

# 5. .xmind 行补全类名
rep('| .xmind (ZIP) | ✔ | ✔ | Xmind 原生可开（notes/style 为真实键；summaries 为真实双结构：range 元组 + topicId + children.summary） |',
    '| .xmind (ZIP) | ✔ | ✔ | Xmind 原生可开（notes/style 为真实键；summaries 为真实双结构：range 元组 + topicId + children.summary；structureClass 写全类名，含 logic-chart.right 等成长方向；导入兼容 Xmind 全类名及近亲变体） |')

# 6. 测试数量
rep('| **单元测试** | `npm run test:unit` | 42 项：', '| **单元测试** | `npm run test:unit` | 48 项（含成长方向引擎/分支覆盖/类名映射回路）：')
rep('| **几何断言** | `npm run test:verify` | 24 项：', '| **几何断言** | `npm run test:verify` | 27 项（含逻辑图向右/向左、分支方向覆盖）：')
rep('| **端到端** | `npm run test:e2e` | 35 项：', '| **端到端** | `npm run test:e2e` | 36 项（含 logic-right 全侧断言）：')

# 7. 建议迭代方向补充（顺时针/逆时针/鱼骨头向变体）
rep('| 中 | 主题自定义（用户自建主题保存/加载） | 一天 |',
    '''| 中 | 主题自定义（用户自建主题保存/加载） | 一天 |
| 中 | 其余成长方向结构：发散图（map.clockwise/anticlockwise/unbalanced）、鱼骨头向（fishbone.rightHeaded）、树/括号图（tree.*/brace.*） | 各半天 |''')

io.open(p, 'w', encoding='utf-8').write(s)
print('HANDOFF updated for growth direction')
