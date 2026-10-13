import { describe, it, expect } from 'vitest';
import { Topic, Sheet, applySheet, fromJSON, toJSON, toXmindSheets, xmindPackageFiles, walkVisible, subtreeCount, styleToProperties, styleFromProperties, LINE_CLASS_LABELS, addSheet, removeSheet, sheets, switchSheet, removeChildFromParent, siblingChannel, renameLegacyTitles, type TopicSummary } from '../src/model';
import { buildZip, unzipEntry } from '../src/zip';
import { StructureEngines, measureSubtreeHeights } from '../src/engines';
import { edgePathFor, THEME_PRESETS, getTheme, releaseThemePaint, releaseStaleThemePaint, effectiveStyle } from '../src/edges';
import { SHAPES, SHAPE_GROUPS, getShape, clipPathOf } from '../src/shapes';
import { pinchTransform, isLongPress, isDoubleTap } from '../src/gestures';
import { findMatches } from '../src/findcore';
import { buildDocx, buildXlsx, buildPptx, buildTextbundle } from '../src/ooxml';
import type { MeasureCtx, Topic as T } from '../src/engines';

/** 注入式假测量器：固定尺寸（100×40），让引擎成为纯函数 */
const fakeCtx: MeasureCtx = { gapV: 14, gapH: 58, sizeOf: () => ({ w: 100, h: 40 }) };

function buildSheet(structure: string, childCounts: number[]): Sheet {
  const s = new Sheet('根');
  s.structureClass = structure;
  childCounts.forEach((n, i) => {
    const c = new Topic(`分支${i}`);
    for (let j = 0; j < n; j++) c.children.push(new Topic(`细节${i}-${j}`));
    s.root.children.push(c);
  });
  return s;
}

describe('模型层：.xmind content.json 序列化回路', () => {
  it('toJSON → fromJSON 保留树结构/折叠/备注/结构类', () => {
    const s = buildSheet('fishbone', [2, 0, 1]);
    s.root.children[0]!.collapsed = true;
    s.root.children[2]!.note = '来自测试';
    applySheet(s);
    const restored = fromJSON(JSON.parse(JSON.stringify(toJSON())));
    expect(restored.structureClass).toBe('fishbone');
    expect(restored.root.children[0]!.collapsed).toBe(true);
    expect(restored.root.children[2]!.note).toBe('来自测试');
    expect(subtreeCount(restored.root)).toBe(subtreeCount(s.root));
  });

  it('读取 Xmind 真实备注结构 notes.plain.content', () => {
    const restored = fromJSON({
      sheets: [{
        rootTopic: { title: 'R', notes: { plain: { content: 'Xmind 原生备注' } }, children: { attached: [{ title: 'A' }] } }
      }]
    });
    expect(restored.root.note).toBe('Xmind 原生备注');
    expect(restored.root.children).toHaveLength(1);
  });

  it('未知结构类回退 logic-chart；walkVisible 跳过折叠子树', () => {
    const s = buildSheet('not-a-structure', [1, 1]);
    s.root.children[0]!.collapsed = true;
    applySheet(s);
    expect(s.structureClass).toBe('not-a-structure');           // 模型保留原值
    expect(fromJSON(toJSON()).structureClass).toBe('logic-chart'); // 读回时回退
    expect([...walkVisible()].length).toBe(4);                   // 5 主题折叠 b0 后：根+b0+b1+细节1 = 4 可见
  });

  it('ZIP 的 CRC32 用标准向量 123456789', () => {
    const zip = buildZip([{ name: 'a.txt', data: new TextEncoder().encode('123456789') }]);
    const crc = new DataView(zip.buffer, zip.byteOffset, zip.byteLength).getUint32(14, true);
    expect(crc).toBe(0xCBF43926);
  });

  it('Xmind 包是工作表数组：主题带 class，空 extensions 不落成对象', async () => {
    const s = buildSheet('fishbone', [1]);
    s.root.children[0]!.collapsed = true;
    s.root.children[0]!.side = 'left';
    applySheet(s);
    const shaped = toXmindSheets(toJSON());
    expect(Array.isArray(shaped)).toBe(true);
    expect(shaped[0]!.class).toBe('sheet');
    expect(shaped[0]!.themeClass).toBeUndefined();
    expect(shaped[0]!.topicPositioning).toBeUndefined();
    expect(shaped[0]!.rootTopic!.class).toBe('topic');
    expect(shaped[0]!.rootTopic!.structureClass).toBe('org.xmind.ui.fishbone.leftHeaded');
    const child = shaped[0]!.rootTopic!.children!.attached![0]!;
    expect(child.class).toBe('topic');
    expect(child.branch).toBe('folded');
    expect(child.extensions).toEqual([{ provider: 'zhiya', content: { collapsed: true, side: 'left' } }]);
    const plain = buildSheet('logic-chart', [0]);
    applySheet(plain);
    const bare = toXmindSheets(toJSON())[0]!.rootTopic!.children!.attached![0]!;
    expect(bare.extensions).toBeUndefined();
    expect(bare.branch).toBeUndefined();

    const extra = new Uint8Array([1, 2, 3]);
    const files = xmindPackageFiles(shaped, [
      { name: 'resources/a.png', data: extra },
      { name: 'resources/a.png', data: extra }
    ]);
    expect(files.map(f => f.name)).toEqual(['content.json', 'metadata.json', 'resources/a.png', 'manifest.json']);
    const zip = buildZip(files);
    const text = async (name: string) => new TextDecoder().decode((await unzipEntry(zip, name))!);
    const content = JSON.parse(await text('content.json'));
    expect(Array.isArray(content)).toBe(true);
    const meta = JSON.parse(await text('metadata.json'));
    expect(meta).toMatchObject({
      dataStructureVersion: '3',
      layoutEngineVersion: '5',
      activeSheetId: shaped[0]!.id,
      creator: { name: 'Vana', version: '26.05.01107' }
    });
    const manifest = JSON.parse(await text('manifest.json'));
    expect(manifest['file-entries']).toEqual({
      'content.json': {},
      'metadata.json': {},
      'resources/a.png': {}
    });
    const restored = fromJSON({ sheets: content });
    expect(restored.structureClass).toBe('fishbone');
    expect(restored.root.children[0]!.collapsed).toBe(true);
    expect(restored.root.children[0]!.side).toBe('left');
    const onlyRoot = JSON.parse(JSON.stringify(content)) as typeof content;
    delete onlyRoot[0].structureClass;
    expect(fromJSON({ sheets: onlyRoot }).structureClass).toBe('fishbone');

    const pictured = buildSheet('logic-chart', [0]);
    pictured.root.image = { src: 'xap:resources/a.png', w: 80, h: 40, align: 'left' };
    const note = new Topic('标注');
    note.pos = { x: 12, y: 24 };
    pictured.root.calloutKids.push(note);
    const floating = new Topic('自由');
    floating.pos = { x: 3, y: 4 };
    pictured.root.detachedKids.push(floating);
    applySheet(pictured);
    const packed = toXmindSheets(toJSON())[0]!;
    expect(packed.topicPositioning).toBeUndefined();
    expect(packed.rootTopic!.structureClass).toBe('org.xmind.ui.logic-chart');
    expect(packed.rootTopic!.image).toEqual({ src: 'xap:resources/a.png', width: 80, height: 40, align: 'left' });
    const callout = packed.rootTopic!.children!.callout;
    expect(Array.isArray(callout)).toBe(true);
    expect(callout![0]!.title).toBe('标注');
    expect(packed.rootTopic!.children!.calloutTopics).toBeUndefined();
    const opened = fromJSON({ sheets: [packed] });
    expect(opened.root.image).toEqual({ src: 'xap:resources/a.png', w: 80, h: 40, align: 'left' });
    expect(opened.root.calloutKids).toHaveLength(1);
    expect(opened.root.calloutKids[0]!.pos).toEqual({ x: 12, y: 24 });
    expect(fromJSON({ sheets: [{ rootTopic: { title: '单', children: { callout: { title: '一个' } } } }] }).root.calloutKids[0]!.title).toBe('一个');
  });
});

describe('结构引擎：logic-chart（双侧平衡）', () => {
  it('等高 4 分支 → 2/2 平分', () => {
    const s = buildSheet('logic-chart', [1, 1, 1, 1]);
    applySheet(s);
    const eng = StructureEngines['logic-chart']!;
    const heights = measureSubtreeHeights(fakeCtx);
    const split = eng.growthSplit!(s.root, heights)!;
    expect(split.right).toHaveLength(2);
    expect(split.left).toHaveLength(2);
  });

  it('高度倾斜 → 切分点最小化两侧总高差', () => {
    const s = buildSheet('logic-chart', [3, 3, 1, 1, 1, 1]);
    applySheet(s);
    const eng = StructureEngines['logic-chart']!;
    const heights = measureSubtreeHeights(fakeCtx);
    const split = eng.growthSplit!(s.root, heights)!;
    const h = (ids: string[]) => ids.reduce((a, id) => a + (heights.get(id) ?? 0), 0);
    expect(Math.abs(h(split.right) - h(split.left)))
      .toBeLessThanOrEqual(Math.abs(h(split.right.concat(split.left))));  // 不劣于任意对半
    expect(split.right[0]).toBe(s.root.children[0]!.id);                  // 顺序保持：前半在右
  });

  it('根在原点，右子树 x>0 左子树 x<0，孙辈更远离根', () => {
    const s = buildSheet('logic-chart', [2, 2]);
    applySheet(s);
    const eng = StructureEngines['logic-chart']!;
    const heights = measureSubtreeHeights(fakeCtx);
    const split = eng.growthSplit!(s.root, heights)!;
    const pos = eng.arrange(fakeCtx, heights, split);
    expect(pos.get(s.root.id)!.x).toBe(0);
    const rightChild = pos.get(split.right[0]!)!;
    expect(rightChild.x).toBeGreaterThan(0);
    expect(rightChild.side).toBe('right');
    const grandchild = pos.get(s.root.children[0]!.children[0]!.id)!;
    expect(Math.abs(grandchild.x)).toBeGreaterThan(Math.abs(rightChild.x));
  });
});

describe('结构引擎：org-chart / fishbone / timeline', () => {
  it('org-chart：全部非根节点位于根下方', () => {
    const s = buildSheet('org-chart', [2, 2]);
    applySheet(s);
    const eng = StructureEngines['org-chart']!;
    const m = eng.measure(fakeCtx) as { widths: Map<string, number>; heights: Map<string, number> };
    const pos = eng.arrange(fakeCtx, m);
    const rootBox = pos.get(s.root.id)!;
    for (const t of s.root.children) {
      expect(pos.get(t.id)!.y).toBeGreaterThan(rootBox.y);
    }
  });

  it('fishbone：一级分支上下交替 + 脊骨装饰边存在', () => {
    const s = buildSheet('fishbone', [1, 1, 1, 1]);
    applySheet(s);
    const eng = StructureEngines['fishbone']!;
    const m = eng.measure(fakeCtx) as { blocks: Map<string, any> };
    const pos = eng.arrange(fakeCtx, m);
    const sides = s.root.children.map((c, i) => (i % 2 === 0 ? 'up' : 'down'));
    s.root.children.forEach((c, i) => {
      expect(pos.get(c.id)!.side).toBe(sides[i]);
      expect(Math.sign(pos.get(c.id)!.y)).toBe(i % 2 === 0 ? -1 : 1);
    });
    expect(eng.decorEdges!.call(eng, pos)).toContain('L');
  });

  it('timeline：事件上下交替且顺序向右', () => {
    const s = buildSheet('timeline', [1, 1, 1]);
    applySheet(s);
    const eng = StructureEngines['timeline']!;
    const m = eng.measure(fakeCtx) as { blocks: Map<string, any> };
    const pos = eng.arrange(fakeCtx, m);
    const xs = s.root.children.map(c => pos.get(c.id)!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));       // 单调向右
    expect(Math.sign(pos.get(s.root.children[0]!.id)!.y)).toBe(-1);
    expect(Math.sign(pos.get(s.root.children[1]!.id)!.y)).toBe(1);
  });

  it('注册表完整：四个引擎接口齐全', () => {
    for (const id of ['logic-chart', 'org-chart', 'fishbone', 'timeline']) {
      const e = StructureEngines[id] as any;
      expect(e, id).toBeTruthy();
      expect(typeof e.measure).toBe('function');
      expect(typeof e.arrange).toBe('function');
      expect(typeof e.edgePath).toBe('function');
      expect(typeof e.chevronAt).toBe('function');
    }
  });
});

describe('样式系统：Xmind style.properties 兼容', () => {
  it('写入：shape/fill/text/line 转为 Xmind 真实键', () => {
    const p = styleToProperties({ shape: 'ellipse', fill: '#F4D607', text: '#23272F', line: '#3B5BDB' });
    expect(p['shape-class']).toBe('org.xmind.topicShape.ellipse');
    expect(p['svg:fill']).toBe('#F4D607');
    expect(p['fo:color']).toBe('#23272F');
    expect(p['font-color']).toBeUndefined();
    expect(p['line-color']).toBe('#3B5BDB');
  });
  it('读取：Xmind 原生 style.properties → TopicStyle（未知形状安全忽略）', () => {
    const st = styleFromProperties({
      'shape-class': 'org.xmind.topicShape.handDrawnRect', // 未移植的遗留形状 → 忽略
      'svg:fill': '#ABCDEF'
    });
    expect(st.shape).toBeUndefined();
    expect(st.fill).toBe('#ABCDEF');
    expect(styleFromProperties({ 'fo:color': '#112233' }).text).toBe('#112233');
    expect(styleFromProperties({ 'font-color': '#445566' }).text).toBe('#445566');
  });
  it('序列化回路：带样式主题经 toJSON/fromJSON 完整保留', () => {
    const s = buildSheet('logic-chart', [1]);
    s.root.children[0]!.style = { shape: 'diamond', fill: '#F4D607' };
    s.root.style = { shape: 'underline' };
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.style.properties['shape-class']).toBe('org.xmind.topicShape.underline');
    const r = fromJSON(j);
    expect(r.root.style.shape).toBe('underline');
    expect(r.root.children[0]!.style.shape).toBe('diamond');
    expect(r.root.children[0]!.style.fill).toBe('#F4D607');
  });
  it('字号、字形、对齐、线宽、边框走 Xmind 键，缺字段照常打开', () => {
    const p = styleToProperties({
      fontSize: 18, bold: true, italic: true, align: 'left',
      lineWidth: 3, border: '#23272F', borderWidth: 2
    });
    expect(p['fo:font-size']).toBe('18');
    expect(p['fo:font-weight']).toBe('700');
    expect(p['fo:font-style']).toBe('italic');
    expect(p['fo:text-align']).toBe('left');
    expect(p['line-width']).toBe('3');
    expect(p['border-line-color']).toBe('#23272F');
    expect(p['border-line-width']).toBe('2');
    const st = styleFromProperties({
      'fo:font-size': '18pt',
      'fo:font-weight': 'bold',
      'fo:font-style': 'italic',
      'fo:text-align': 'right',
      'line-width': '2.5pt',
      'border-line-color': '#ABCDEF',
      'border-line-width': '1'
    });
    expect(st.fontSize).toBe(18);
    expect(st.bold).toBe(true);
    expect(st.italic).toBe(true);
    expect(st.align).toBe('right');
    expect(st.lineWidth).toBe(2.5);
    expect(st.border).toBe('#ABCDEF');
    expect(st.borderWidth).toBe(1);
    const bare = styleFromProperties({ 'svg:fill': '#FFFFFF' });
    expect(bare.fontSize).toBeUndefined();
    expect(bare.bold).toBeUndefined();
    expect(bare.lineWidth).toBeUndefined();
    expect(bare.border).toBeUndefined();
    const s = buildSheet('logic-chart', [1]);
    s.root.children[0]!.style = { fontSize: 20, lineWidth: 4, border: '#111111', borderWidth: 2, align: 'left', bold: true };
    applySheet(s);
    const back = fromJSON(JSON.parse(JSON.stringify(toJSON())));
    const c = back.root.children[0]!.style;
    expect(c.fontSize).toBe(20);
    expect(c.lineWidth).toBe(4);
    expect(c.border).toBe('#111111');
    expect(c.borderWidth).toBe(2);
    expect(c.align).toBe('left');
    expect(c.bold).toBe(true);
    expect(c.italic).toBeUndefined();
  });
  it('无样式时不产生 style 字段（保持 JSON 干净）', () => {
    const s = buildSheet('logic-chart', [1]);
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.style).toBeUndefined();
    expect(j.sheets[0].rootTopic.children.attached[0].style).toBeUndefined();
  });
});

describe('连线形状（line-class）', () => {
  const a = { x: 0, y: 0, w: 100, h: 40, side: 'root' };
  const b = { x: 250, y: 80, w: 100, h: 40, side: 'right' };
  it('六种连线类生成有效 SVG path', () => {
    for (const lc of Object.keys(LINE_CLASS_LABELS)) {
      const d = edgePathFor(lc, a, b);
      expect(d, lc).toMatch(/^M /);
      expect(d.length, lc).toBeGreaterThanOrEqual(10);   // 非空路径
    }
  });
  it('直线不含曲线控制点（无 C 指令）', () => {
    expect(edgePathFor('straight', a, b)).not.toContain('C');
  });
  it('曲线默认：无 lineClass 时 fallback 到 curve', () => {
    expect(edgePathFor(undefined, a, b)).toBe(edgePathFor('curve', a, b));
  });
  it('lineClass 序列化回路：style ↔ Xmind branchConnection 键', () => {
    const p = styleToProperties({ lineClass: 'elbow' });
    expect(p['line-class']).toBe('org.xmind.branchConnection.elbow');
    const st = styleFromProperties(p);
    expect(st.lineClass).toBe('elbow');
  });
});

describe('主题预设', () => {
  it('四个主题结构完整', () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const th of THEME_PRESETS) {
      expect(th.id, th.id).toBeTruthy();
      expect(th.label, th.id).toBeTruthy();
      expect(th.branchHues.length, th.id).toBeGreaterThanOrEqual(6);
      expect(th.roles.root, th.id).toBeTruthy();
      expect(th.roles.level1, th.id).toBeTruthy();
      expect(th.roles.deeper, th.id).toBeTruthy();
    }
  });
  it('getTheme 回退到 classic', () => {
    expect(getTheme('nonexistent').id).toBe('classic');
  });
  it('themeClass 序列化回路', () => {
    const s = buildSheet('logic-chart', [1]);
    s.themeClass = 'business';
    applySheet(s);
    expect(fromJSON(toJSON()).themeClass).toBe('business');
  });
});

describe('外框（boundary）', () => {
  it('boundary 序列化回路：toJSON → fromJSON 保留', () => {
    const s = buildSheet('logic-chart', [2]);
    s.root.children[0]!.boundary = true;
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    const r = fromJSON(j);
    expect(r.root.children).toHaveLength(1);
    expect(r.root.children[0]!.boundary).toBe(true);
  });
  it('无 boundary 不产生字段', () => {
    const s = buildSheet('logic-chart', [1]);
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.children.attached[0].boundary).toBeUndefined();
  });
});

describe('概要（summary）', () => {
  it('序列化回路：Xmind 真实格式（range 元组 + children.summary 概要 topic）', () => {
    const s = buildSheet('logic-chart', [2, 1]);
    s.root.summaries.push({ id: 'sm1', topicId: 'smt1', title: '要点', rangeStart: 0, rangeEnd: 1 });
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    const rt = j.sheets[0].rootTopic;
    expect(rt.summaries).toHaveLength(1);
    // Xmind 真实键：字符串元组 range + topicId（逆向自官方模板 content.json）
    expect(rt.summaries[0].range).toBe('(0,1)');
    expect(rt.summaries[0].topicId).toBe('smt1');
    expect(rt.children.summary).toHaveLength(1);
    expect(rt.children.summary[0]).toEqual({ id: 'smt1', title: '要点' });
    const r = fromJSON(j);
    expect(r.root.summaries).toHaveLength(1);
    expect(r.root.summaries[0]!.title).toBe('要点');
    expect(r.root.summaries[0]!.rangeStart).toBe(0);
    expect(r.root.summaries[0]!.rangeEnd).toBe(1);
  });

  it('读取 Xmind 原生导图：range/topicId 结构完整还原', () => {
    const restored = fromJSON({
      sheets: [{
        rootTopic: {
          title: 'R',
          children: {
            attached: [{ title: 'A' }, { title: 'B' }],
            summary: [{ id: 'sum-topic-1', title: 'Xmind 概要', attributedTitle: [] }]
          },
          summaries: [{ id: 'wrap-1', range: '(0,1)', topicId: 'sum-topic-1' }]
        }
      }]
    });
    expect(restored.root.summaries).toHaveLength(1);
    expect(restored.root.summaries[0]!.title).toBe('Xmind 概要');
    expect(restored.root.summaries[0]!.topicId).toBe('sum-topic-1');
    expect(restored.root.summaries[0]!.rangeStart).toBe(0);
    expect(restored.root.summaries[0]!.rangeEnd).toBe(1);
  });

  it('向后兼容：旧版 kebab/camel 键仍可读取', () => {
    const restored = fromJSON({
      sheets: [{
        rootTopic: {
          title: 'R',
          children: { attached: [{ title: 'A' }] },
          summaries: [{ id: 'old1', title: '旧格式', 'range-start': 0, 'range-end': 0 }]
        }
      }]
    });
    expect(restored.root.summaries[0]!.title).toBe('旧格式');
    expect(restored.root.summaries[0]!.rangeEnd).toBe(0);
    expect(restored.root.summaries[0]!.topicId).toBeTruthy();   // 自动补概要 topic id
  });

  it('无概要时不产生 summaries/summary 字段', () => {
    const s = buildSheet('logic-chart', [1]);
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.summaries).toBeUndefined();
    expect(j.sheets[0].rootTopic.children.summary).toBeUndefined();
  });
});

describe('多画布（Sheet）', () => {
  it('多画布序列化：两张 sheet 均保留', () => {
    const s1 = buildSheet('logic-chart', [1]);
    const s2 = buildSheet('fishbone', [2]);
    s2.root.title = '第二张';
    applySheet(s1);
    addSheet('第二张');
    sheets[1]!.structureClass = 'fishbone';
    sheets[1]!.root.children.push(new Topic('额外'));
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets).toHaveLength(2);
    // 导出写 Xmind 全类名（真机直接识别结构）；读回规范化为内部 id
    expect(j.sheets[1].structureClass).toBe('org.xmind.ui.fishbone.leftHeaded');
    // 恢复
    const r = fromJSON(j);
    expect(r.structureClass).toBe('logic-chart');  // 第一张
    expect(sheets[1]!.structureClass).toBe('fishbone');
  });

  it('addSheet 增加数量；removeSheet 至少保留一张', () => {
    applySheet(buildSheet('logic-chart', [1]));
    const before = sheets.length;
    const s2 = addSheet('测试');
    expect(sheets.length).toBe(before + 1);
    expect(removeSheet(s2.id)).toBe(true);
    expect(sheets.length).toBe(before);
    expect(removeSheet(sheets[0]!.id)).toBe(false);   // 最后一张不可删
  });

  it('switchSheet 切换当前工作表', () => {
    applySheet(buildSheet('logic-chart', [1]));
    const s2 = addSheet('另一张');
    s2.root.title = '切换目标';
    switchSheet(s2.id);
    // 注意：switchSheet 改变了模块状态，后续测试需要恢复
    switchSheet(sheets[0]!.id);
  });
});

describe('引擎接口：edgePath 几何', () => {
  const eng = StructureEngines['logic-chart']!;
  it('logic 右侧连接线起点在父右缘、终点在子左缘', () => {
    const a = { x: 0, y: 0, w: 100, h: 40, side: 'root' };
    const b = { x: 200, y: 60, w: 100, h: 40, side: 'right' };
    const d = eng.edgePath(a, b, 'right');
    expect(d.startsWith('M 50 0')).toBe(true);
    expect(d.trimEnd().endsWith('150 60')).toBe(true);
  });
  it('fishbone 一级斜刺为 45° 直线（|dx| == |dy|）', () => {
    const fb = StructureEngines['fishbone']!;
    const a = { x: 0, y: 0, w: 100, h: 40, side: 'root' };
    const b = { x: 200, y: -80, w: 100, h: 40, side: 'up' };
    const d = fb.edgePath(a, b, 'up');
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain(' L ');                                 // 直线而非曲线
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.abs((nums[2]! - nums[0]!) - (nums[1]! - nums[3]!))).toBeLessThan(1);
  });
});

describe('形状注册表（44 种 Xmind topicShape）', () => {
  it('注册表完整：43 个条目，与逆向枚举清单一致（HANDOFF 原 44 为约数）', () => {
    const keys = Object.keys(SHAPES);
    expect(keys.length).toBe(43);
    // 逆向自 4654.js/24654.js 的核心 44 枚举（抽样断言关键成员）
    for (const k of ['bookmark', 'circle', 'curlyBracket', 'cutdiamond', 'database', 'decision',
      'document', 'doubleBookQuote', 'ellipserect', 'fatLeftArrow', 'heart', 'manualInput',
      'multiDocument', 'onPageReference', 'predefinedProcess', 'roundBracket', 'roundedhexagon',
      'shield', 'simpleCloud', 'squareBracket', 'squareQuote', 'stack', 'star', 'waterdrop',
      'ellipticrectangle', 'doubleunderline', 'label', 'delay', 'data', 'manualOperation',
      'offPageReference', 'singleBookQuote', 'singlebreakangle', 'fatRightArrow', 'doubleQuote',
      'decision', 'circle']) {
      expect(SHAPES[k], k).toBeTruthy();
    }
  });

  it('每个形状定义合法：有 label，点表坐标在 0-1 且 ≥3 点，渲染通道唯一', () => {
    for (const [k, def] of Object.entries(SHAPES)) {
      expect(def.label, k).toBeTruthy();
      const channels = [def.pts ? 1 : 0, def.radius !== undefined ? 1 : 0, def.ellipse ? 1 : 0, def.line ? 1 : 0]
        .reduce((a: number, b: number) => a + b, 0);
      expect(channels, k).toBe(1);                          // 恰好一种渲染通道
      if (def.pts) {
        expect(def.pts.length, k).toBeGreaterThanOrEqual(4); // 最少的三角形+1
        for (const [x, y] of def.pts) {
          expect(x, k).toBeGreaterThanOrEqual(0); expect(x, k).toBeLessThanOrEqual(1);
          expect(y, k).toBeGreaterThanOrEqual(0); expect(y, k).toBeLessThanOrEqual(1);
        }
        expect(clipPathOf(def.pts), k).toMatch(/^polygon\(/);
      }
    }
  });

  it('clipPathOf 输出百分比坐标', () => {
    expect(clipPathOf([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe('polygon(0.00% 0.00%, 100.00% 0.00%, 100.00% 100.00%, 0.00% 100.00%)');
  });

  it('37 种新形状序列化回路：style-class 双向转换', () => {
    for (const k of ['database', 'simpleCloud', 'heart', 'star', 'fatRightArrow', 'squareBracket']) {
      const p = styleToProperties({ shape: k as never });
      expect(p['shape-class'], k).toBe('org.xmind.topicShape.' + k);
      expect(styleFromProperties(p).shape, k).toBe(k);
    }
  });

  it('Xmind 遗留形状（未移植）安全忽略', () => {
    const st = styleFromProperties({ 'shape-class': 'org.xmind.topicShape.handDrawnRect' });
    expect(st.shape).toBeUndefined();
    expect(getShape('handDrawnRect')).toBeUndefined();
  });

  it('侧栏分组覆盖全部形状（43 - 1 别名 = 42 个按钮）', () => {
    const all = SHAPE_GROUPS.flatMap(g => g.shapes);
    expect(new Set(all).size).toBe(all.length);             // 无重复
    const aliases = ['ellipticrectangle'];                   // 别名不出按钮
    const registry = Object.keys(SHAPES).filter(k => !aliases.includes(k));
    for (const k of registry) expect(all, k).toContain(k);
    expect(all.length).toBe(registry.length);
  });
});

describe('触屏手势纯函数（gestureSession 数学）', () => {
  it('pinchTransform：缩放比正确且世界锚点保持不动', () => {
    const zoom = 1, pan = { x: 100, y: 50 };
    // 双指从相距 100 拉开到相距 200（2x），中点从 (300,200) 移到 (350,260)
    const prev: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 250, y: 200 }, { x: 350, y: 200 }];
    const next: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 250, y: 260 }, { x: 450, y: 260 }];
    const r = pinchTransform(zoom, pan, prev, next);
    expect(r.zoom).toBeCloseTo(2, 5);
    // 世界锚点 = 旧中点 (300,200) 的世界坐标 = ((300-100)/1, (200-50)/1) = (200,150)
    // 新变换下该世界点应落在新中点 (350,260)
    expect(200 * r.zoom + r.pan.x).toBeCloseTo(350, 5);
    expect(150 * r.zoom + r.pan.y).toBeCloseTo(260, 5);
  });

  it('pinchTransform：缩小钳制到 0.15 下限', () => {
    const r = pinchTransform(0.2, { x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 40, y: 0 }, { x: 60, y: 0 }]);
    expect(r.zoom).toBe(0.15);
  });

  it('长按判定：时间 ≥500ms 且位移 <8px', () => {
    expect(isLongPress({ x: 0, y: 0 }, { x: 3, y: 3 }, 600)).toBe(true);
    expect(isLongPress({ x: 0, y: 0 }, { x: 30, y: 0 }, 600)).toBe(false);
    expect(isLongPress({ x: 0, y: 0 }, { x: 0, y: 0 }, 400)).toBe(false);
  });

  it('双击判定：间隔 ≤320ms 且落点 <24px', () => {
    expect(isDoubleTap({ x: 0, y: 0 }, { x: 10, y: 0 }, 250)).toBe(true);
    expect(isDoubleTap({ x: 0, y: 0 }, { x: 60, y: 0 }, 250)).toBe(false);
    expect(isDoubleTap({ x: 0, y: 0 }, { x: 0, y: 0 }, 500)).toBe(false);
  });
});

describe('成长方向（Growth Direction：logic 家族 + 分支级 side 覆盖）', () => {
  it('逻辑图·向右：全部一级分支在右侧；逻辑图·向左镜像', () => {
    const s = buildSheet('logic-right', [1, 1, 1, 1]);
    applySheet(s);
    const eng = StructureEngines['logic-right']!;
    const heights = measureSubtreeHeights(fakeCtx);
    const pos = eng.arrange(fakeCtx, heights, eng.growthSplit!(s.root, heights)!);
    for (const c of s.root.children) expect(pos.get(c.id)!.x).toBeGreaterThan(0);
    const s2 = buildSheet('logic-left', [1, 1]);
    applySheet(s2);
    const eng2 = StructureEngines['logic-left']!;
    const h2 = measureSubtreeHeights(fakeCtx);
    const pos2 = eng2.arrange(fakeCtx, h2, eng2.growthSplit!(s2.root, h2)!);
    for (const c of s2.root.children) expect(pos2.get(c.id)!.x).toBeLessThan(0);
  });

  it('平衡模式尊重分支级 side 覆盖：钉左的在左、钉右的在右，其余自动平衡', () => {
    const s = buildSheet('logic-chart', [1, 1, 1, 1]);
    s.root.children[0]!.side = 'left';    // 第一个分支钉在左侧
    s.root.children[3]!.side = 'right';   // 最后一个分支钉在右侧
    applySheet(s);
    const eng = StructureEngines['logic-chart']!;
    const heights = measureSubtreeHeights(fakeCtx);
    const split = eng.growthSplit!(s.root, heights)!;
    expect(split.left).toContain(s.root.children[0]!.id);
    expect(split.right).toContain(s.root.children[3]!.id);
    const pos = eng.arrange(fakeCtx, heights, split);
    expect(pos.get(s.root.children[0]!.id)!.x).toBeLessThan(0);
    expect(pos.get(s.root.children[3]!.id)!.x).toBeGreaterThan(0);
  });

  it('向右模式下的向左覆盖：钉左分支单独在左，其余全在右', () => {
    const s = buildSheet('logic-right', [1, 1, 1]);
    s.root.children[1]!.side = 'left';
    applySheet(s);
    const eng = StructureEngines['logic-right']!;
    const heights = measureSubtreeHeights(fakeCtx);
    const split = eng.growthSplit!(s.root, heights)!;
    expect(split.left).toEqual([s.root.children[1]!.id]);
    expect(split.right).toHaveLength(2);
  });

  it('structureClass ↔ Xmind 全类名：导出全名、导入规范化（含近亲变体）', () => {
    const s = buildSheet('logic-right', [1]);
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].structureClass).toBe('org.xmind.ui.logic.right');
    applySheet(buildSheet('logic-left', [1]));
    expect(JSON.parse(JSON.stringify(toJSON())).sheets[0].structureClass).toBe('org.xmind.ui.logic.left');
    applySheet(s);
    expect(fromJSON(j).structureClass).toBe('logic-right');
    // Xmind 逻辑图（向右/向左）导入 → 单侧思维导图
    expect(fromJSON({ sheets: [{ structureClass: 'org.xmind.ui.logic.right', rootTopic: { title: 'R' } }] }).structureClass).toBe('logic-right');
    expect(fromJSON({ sheets: [{ structureClass: 'org.xmind.ui.logic.left', rootTopic: { title: 'R' } }] }).structureClass).toBe('logic-left');
    expect(fromJSON({ sheets: [{ structureClass: 'org.xmind.ui.logic-chart.right', rootTopic: { title: 'R' } }] }).structureClass).toBe('logic-right');
    expect(fromJSON({ sheets: [{ structureClass: 'org.xmind.ui.logic-chart.left', rootTopic: { title: 'R' } }] }).structureClass).toBe('logic-left');
    expect(fromJSON({ sheets: [{ structureClass: 'org.xmind.ui.map.clockwise', rootTopic: { title: 'R' } }] }).structureClass).toBe('map-clockwise');   // v1.14 起原生支持
  });

  it('side 序列化回路：extensions.side 往返保留', () => {
    const s = buildSheet('logic-chart', [1, 1]);
    s.root.children[0]!.side = 'left';
    applySheet(s);
    const r = fromJSON(JSON.parse(JSON.stringify(toJSON())));
    expect(r.root.children[0]!.side).toBe('left');
    expect(r.root.children[1]!.side).toBe('auto');
  });

  it('注册表完整：logic 家族三引擎接口齐全', () => {
    for (const id of ['logic-chart', 'logic-right', 'logic-left']) {
      const e = StructureEngines[id] as any;
      expect(e, id).toBeTruthy();
      expect(typeof e.arrange).toBe('function');
      expect(typeof e.growthSplit).toBe('function');
    }
  });
});

describe('标记系统（Xmind markers）', () => {
  it('序列化回路：markers → [{markerId}] 真实键', () => {
    const s = buildSheet('logic-chart', [1]);
    s.root.children[0]!.markers = ['priority-1', 'flag-blue'];
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.children.attached[0].markers)
      .toEqual([{ markerId: 'priority-1' }, { markerId: 'flag-blue' }]);
    const r = fromJSON(j);
    expect(r.root.children[0]!.markers).toEqual(['priority-1', 'flag-blue']);
  });
  it('无标记不产生字段；读取 Xmind 原生 markers', () => {
    const s = buildSheet('logic-chart', [1]);
    applySheet(s);
    expect(JSON.parse(JSON.stringify(toJSON())).sheets[0].rootTopic.markers).toBeUndefined();
    const r = fromJSON({ sheets: [{ rootTopic: { title: 'R', markers: [{ markerId: 'star-red' }, { markerId: 'smiley-smile' }] } }] });
    expect(r.root.markers).toEqual(['star-red', 'smiley-smile']);
  });
});

describe('联系（Xmind sheet.relationships）', () => {
  it('序列化回路：end1Id/end2Id/title 真实键', () => {
    const s = buildSheet('logic-chart', [1, 1]);
    applySheet(s);
    const a = s.root.children[0]!.id, b = s.root.children[1]!.id;
    sheets[0]!.relationships.push({ id: 'rel1', fromId: a, toId: b, title: '导致' });
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].relationships).toEqual([{ id: 'rel1', end1Id: a, end2Id: b, title: '导致' }]);
    const r = fromJSON(j);
    expect(r.id).toBe(sheets[0]!.id);                    // 恢复的是当前工作表
    expect(sheets[0]!.relationships).toHaveLength(1);
    expect(sheets[0]!.relationships[0]!.title).toBe('导致');
  });
  it('无联系不产生字段；悬空引用被过滤', () => {
    const s = buildSheet('logic-chart', [1]);
    applySheet(s);
    expect(JSON.parse(JSON.stringify(toJSON())).sheets[0].relationships).toBeUndefined();
    const r = fromJSON({ sheets: [{ rootTopic: { title: 'R' }, relationships: [{ id: 'x', end1Id: 'ghost', end2Id: 'none' }] }] });
    expect(r.relationships.length).toBe(0);
  });
});

describe('自由主题（Xmind children.detached + position）', () => {
  it('序列化回路：children.detached + position + topicPositioning:fixed', () => {
    const s = buildSheet('logic-chart', [1]);
    const d = new Topic('浮动想法');
    d.pos = { x: 320, y: -140 };
    s.root.detachedKids.push(d);
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].topicPositioning).toBe('fixed');
    expect(j.sheets[0].rootTopic.children.detached[0].position).toEqual({ x: 320, y: -140 });
    const r = fromJSON(j);
    expect(r.root.detachedKids).toHaveLength(1);
    expect(r.root.detachedKids[0]!.pos).toEqual({ x: 320, y: -140 });
    expect([...walkVisible()].some(t => t.title === '浮动想法')).toBe(true);   // 可见遍历含自由主题
  });
  it('subtreeCount 覆盖双通道', () => {
    const s = buildSheet('logic-chart', [1]);
    const d = new Topic('游离');
    d.pos = { x: 10, y: 10 };
    const dc = new Topic('游离子题');
    d.children.push(dc);
    s.root.detachedKids.push(d);
    applySheet(s);
    expect(subtreeCount(s.root)).toBe(5);   // 根 + 分支 + 细节（buildSheet[1]）+ 游离 + 游离子题
  });
  it('removeChildFromParent 双通道移除', () => {
    const s = buildSheet('logic-chart', [1]);
    const d = new Topic('游离');
    s.root.detachedKids.push(d);
    applySheet(s);
    removeChildFromParent(s.root, d);
    expect(s.root.detachedKids).toHaveLength(0);
    const c = s.root.children[0]!;
    removeChildFromParent(s.root, c);
    expect(s.root.children).toHaveLength(0);
  });
  it('removeChildFromParent 找不到时不误删最后一个子主题', () => {
    const s = buildSheet('logic-chart', [1]);
    applySheet(s);
    const keep = s.root.children[0]!;
    removeChildFromParent(s.root, new Topic('不存在'));
    expect(s.root.children).toEqual([keep]);
  });
  it('siblingChannel 区分 attached / detached / callout', () => {
    const s = buildSheet('logic-chart', [1]);
    const floating = new Topic('游离');
    const callout = new Topic('标注');
    s.root.detachedKids.push(floating);
    s.root.calloutKids.push(callout);
    applySheet(s);
    expect(siblingChannel(s.root, s.root.children[0]!)).toBe(s.root.children);
    expect(siblingChannel(s.root, floating)).toBe(s.root.detachedKids);
    expect(siblingChannel(s.root, callout)).toBe(s.root.calloutKids);
    expect(siblingChannel(s.root, new Topic('无'))).toBeNull();
  });
});

describe('查找替换（findMatches 纯函数）', () => {
  it('命中标题与备注，含多处出现；大小写不敏感', () => {
    const s = buildSheet('logic-chart', [1, 1]);
    s.root.children[0]!.title = '引擎A';
    s.root.children[0]!.note = '引擎 说明';
    s.root.children[1]!.title = '别的';
    applySheet(s);
    const ms = findMatches([...walkVisible()], '引擎');
    expect(ms.length).toBe(2);                       // 标题 1 + 备注 1
    expect(ms[0]!.field).toBe('title');
    expect(ms[1]!.field).toBe('note');
    expect(findMatches([...walkVisible()], '引擎a').length).toBe(1);   // 大小写不敏感
  });
  it('同一标题多处命中逐一列出；空查询返回空', () => {
    const s = buildSheet('logic-chart', [1]);
    s.root.children[0]!.title = 'ab ab ab';
    applySheet(s);
    expect(findMatches([...walkVisible()], 'ab').length).toBe(3);
    expect(findMatches([...walkVisible()], '')).toHaveLength(0);
  });
});

describe('OOXML 生成器（零依赖 docx/xlsx/pptx/textbundle）', () => {
  const balanced = (xml: string, tag: string): boolean => {
    const count = (body: string) => (xml.match(new RegExp(body, 'g')) ?? []).length;
    const open = count('<' + tag + '(?=[\\s/>])');
    const close = count('</' + tag + '>');
    const selfClosed = count('<' + tag + '(?=[\\s/>])[^>]*/>');
    return open === close + selfClosed;
  };
  it('docx：包含 content types/rels/document，段落标签配平，备注成引文段', () => {
    const s = buildSheet('logic-chart', [2, 1]);
    s.root.children[0]!.note = '备注文本';
    applySheet(s);
    const buf = buildDocx();
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf[0]).toBe(0x50); expect(buf[1]).toBe(0x4B);   // ZIP 魔数
    const xml = new TextDecoder().decode(buf);
    expect(xml).toContain('[Content_Types].xml');
    expect(xml).toContain('word/document.xml');
    expect(xml).toContain('备注文本');
    expect(balanced(xml, 'w:p')).toBe(true);
    expect(balanced(xml, 'w:document')).toBe(true);
  });
  it('xlsx：sheet1 含表头与大纲行，单元格配平', () => {
    const s = buildSheet('logic-chart', [1]);
    s.root.children[0]!.markers = ['priority-1'];
    applySheet(s);
    const xml = new TextDecoder().decode(buildXlsx());
    expect(xml).toContain('xl/worksheets/sheet1.xml');
    expect(xml).toContain('层级');
    expect(xml).toContain('P1');                     // 标记转标签
    expect(balanced(xml, 'row')).toBe(true);
    expect(balanced(xml, 'c')).toBe(true);
  });
  it('pptx：每个一级分支一页，presentation 引用齐全', () => {
    const s = buildSheet('logic-chart', [1, 1, 1]);
    applySheet(s);
    const xml = new TextDecoder().decode(buildPptx());
    expect(xml).toContain('ppt/presentation.xml');
    expect(xml).toContain('ppt/slideMasters/slideMaster1.xml');
    for (let i = 256; i < 259; i++) expect(xml).toContain(`ppt/slides/slide${i}.xml`);
    expect(balanced(xml, 'p:sp')).toBe(true);
    expect((xml.match(/<p:sldId /g) ?? []).length).toBe(3);
  });
  it('textbundle：text.markdown + info.json 结构', () => {
    const s = buildSheet('logic-chart', [1]);
    applySheet(s);
    const xml = new TextDecoder().decode(buildTextbundle('# 根\n\n- 甲\n'));
    expect(xml).toContain('text.markdown');
    expect(xml).toContain('info.json');
    expect(xml).toContain('net.daringfireball.markdown');
    expect(xml).toContain('- 甲');
  });
});

describe('v1.13：labels / href / image / callout 通道', () => {
  it('labels 序列化回路：字符串数组（Xmind 真实形态）', () => {
    const s = buildSheet('logic-chart', [1]);
    s.root.children[0]!.labels = ['Monday', '重要'];
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.children.attached[0].labels).toEqual(['Monday', '重要']);
    expect(fromJSON(j).root.children[0]!.labels).toEqual(['Monday', '重要']);
  });
  it('href 序列化回路：网页与 xap:attachments 引用', () => {
    const s = buildSheet('logic-chart', [1, 1]);
    s.root.children[0]!.href = 'https://example.com';
    s.root.children[1]!.href = 'xap:attachments/report.pdf';
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.children.attached[0].href).toBe('https://example.com');
    expect(j.sheets[0].rootTopic.children.attached[1].href).toBe('xap:attachments/report.pdf');
    const r = fromJSON(j);
    expect(r.root.children[0]!.href).toBe('https://example.com');
    expect(r.root.children[1]!.href).toBe('xap:attachments/report.pdf');
  });
  it('image 序列化回路：src/w/h/align（Xmind: image 键）', () => {
    const s = buildSheet('logic-chart', [1]);
    s.root.children[0]!.image = { src: 'data:image/png;base64,AAAA', w: 220, h: 120, align: 'left' };
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.children.attached[0].image).toEqual({ src: 'data:image/png;base64,AAAA', w: 220, h: 120, align: 'left' });
    const r = fromJSON(j);
    expect(r.root.children[0]!.image?.src).toBe('data:image/png;base64,AAAA');
    expect(r.root.children[0]!.image?.w).toBe(220);
  });
  it('callout 通道：children.calloutTopics + position 往返，isCallout 标记', () => {
    const s = buildSheet('logic-chart', [1]);
    const c = new Topic('注解');
    c.pos = { x: 140, y: 220 };
    s.root.calloutKids.push(c);
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.children.calloutTopics[0].position).toEqual({ x: 140, y: 220 });
    const r = fromJSON(j);
    expect(r.root.calloutKids).toHaveLength(1);
    expect(r.root.calloutKids[0]!.isCallout).toBe(true);
    expect(r.root.calloutKids[0]!.pos).toEqual({ x: 140, y: 220 });
    // 可见遍历含 callout；removeChildFromParent 三通道
    expect([...walkVisible()].some(t => t.title === '注解')).toBe(true);
    removeChildFromParent(r.root, r.root.calloutKids[0]!);
    expect(r.root.calloutKids).toHaveLength(0);
  });
});

describe('v1.14 新引擎（org-up / 竖向时间轴 / 发散图 / 树图 / 括号图）', () => {
  it('org-chart-up：全部非根节点位于根上方', () => {
    const s = buildSheet('org-chart-up', [2, 1]);
    applySheet(s);
    const eng = StructureEngines['org-chart-up']!;
    const m = eng.measure(fakeCtx) as { widths: Map<string, number>; heights: Map<string, number> };
    const pos = eng.arrange(fakeCtx, m);
    const rootY = pos.get(s.root.id)!.y;
    for (const t of s.root.children) expect(pos.get(t.id)!.y).toBeLessThan(rootY);
  });
  it('timeline-vertical：事件左右交替 + 轴线装饰存在', () => {
    const s = buildSheet('timeline-vertical', [1, 1, 1]);
    applySheet(s);
    const eng = StructureEngines['timeline-vertical']!;
    const m = eng.measure(fakeCtx) as { blocks: Map<string, any> };
    const pos = eng.arrange(fakeCtx, m);
    const xs = s.root.children.map(c => Math.sign(pos.get(c.id)!.x));
    expect(xs).toContain(-1);
    expect(xs).toContain(1);                          // 左右交替
    expect(eng.decorEdges!.call(eng, pos)).toContain('L');
  });
  it('map-clockwise：一级分支角向全覆盖（四个象限都有），辐射直线边', () => {
    const s = buildSheet('map-clockwise', [1, 1, 1, 1]);
    applySheet(s);
    const eng = StructureEngines['map-clockwise']!;
    const h = measureSubtreeHeights(fakeCtx);
    const pos = eng.arrange(fakeCtx, h);
    const qs = new Set(s.root.children.map(c => {
      const p = pos.get(c.id)!;
      return `${Math.sign(p.x)},${Math.sign(p.y)}`;
    }));
    expect(qs.size).toBeGreaterThanOrEqual(3);        // 分布在至少 3 个象限
    const d = eng.edgePath({ x: 0, y: 0, w: 100, h: 40, side: 'root' }, { x: 200, y: 0, w: 100, h: 40, side: 'map' }, 'map');
    expect(d).toContain(' L ');                       // 直线辐射
    // 逆时针引擎注册齐全
    expect(StructureEngines['map-anticlockwise']).toBeTruthy();
  });
  it('map-unbalanced：单侧 + side 覆盖（即 logic-right 语义）', () => {
    const s = buildSheet('map-unbalanced', [1, 1, 1]);
    s.root.children[1]!.side = 'left';
    applySheet(s);
    const eng = StructureEngines['map-unbalanced']!;
    const h = measureSubtreeHeights(fakeCtx);
    const split = eng.growthSplit!(s.root, h)!;
    expect(split.left).toEqual([s.root.children[1]!.id]);
    expect(split.right).toHaveLength(2);
  });
  it('tree-right：子块自父主题顶部展开（首个子题 y ≈ 根 y - h/2），直角边', () => {
    const s = buildSheet('tree-right', [2, 1]);
    applySheet(s);
    const eng = StructureEngines['tree-right']!;
    const m = eng.measure(fakeCtx) as { blocks: Map<string, any> };
    const pos = eng.arrange(fakeCtx, m);
    const rootP = pos.get(s.root.id)!;
    const first = pos.get(s.root.children[0]!.id)!;
    const firstColH = m.blocks.get(s.root.children[0]!.id)!.colH;
    expect(first.x).toBeGreaterThan(rootP.x + 40);    // 右侧
    expect(first.y - firstColH / 2).toBeCloseTo(rootP.y - 20, 0);   // 子块顶 ≈ 父主题顶（大纲式）
    const d = eng.edgePath(rootP, first, 'right');
    expect((d.match(/L/g) ?? []).length).toBeGreaterThanOrEqual(2);   // 直角折线
    expect(StructureEngines['tree-left']).toBeTruthy();
  });
  it('brace-right：括号装饰含 Q 曲线，逐边连线为空', () => {
    const s = buildSheet('brace-right', [2, 1]);
    applySheet(s);
    const eng = StructureEngines['brace-right']!;
    const h = measureSubtreeHeights(fakeCtx);
    const pos = eng.arrange(fakeCtx, h, eng.growthSplit!(s.root, h));
    const decor = eng.decorEdges!(pos);
    expect(decor).toContain('Q');                      // 花括号
    expect(eng.edgePath(pos.get(s.root.id)!, pos.get(s.root.children[0]!.id)!, 'right')).toBe('');
    expect(StructureEngines['brace-left']).toBeTruthy();
  });
  it('结构类映射：10 个新引擎全类名双向回路', () => {
    const pairs = [
      ['org-chart-up', 'org.xmind.ui.org-chart.up'],
      ['fishbone-right', 'org.xmind.ui.fishbone.rightHeaded'],
      ['timeline-vertical', 'org.xmind.ui.timeline.vertical'],
      ['map-unbalanced', 'org.xmind.ui.map.unbalanced'],
      ['map-clockwise', 'org.xmind.ui.map.clockwise'],
      ['map-anticlockwise', 'org.xmind.ui.map.anticlockwise'],
      ['tree-right', 'org.xmind.ui.tree.right'],
      ['tree-left', 'org.xmind.ui.tree.left'],
      ['brace-right', 'org.xmind.ui.brace.right'],
      ['brace-left', 'org.xmind.ui.brace.left']
    ];
    for (const [id, full] of pairs) {
      const s = buildSheet(id, [1]);
      applySheet(s);
      const j = JSON.parse(JSON.stringify(toJSON()));
      expect(j.sheets[0].structureClass, id).toBe(full);
      expect(fromJSON(j).structureClass, id).toBe(id);
    }
  });
});

describe('labels 入查找', () => {
  it('标签文本命中（field=labels，含 labelIdx），替换作用于命中的标签', () => {
    const s = buildSheet('logic-chart', [1, 1]);
    s.root.children[0]!.labels = ['重要', 'Monday'];
    s.root.children[1]!.labels = ['次要'];
    applySheet(s);
    const ms = findMatches([...walkVisible()], 'monday');
    expect(ms).toHaveLength(1);
    expect(ms[0]!.field).toBe('labels');
    expect(ms[0]!.labelIdx).toBe(1);
    const t = s.root.children[0]!;
    t.labels[1] = t.labels[1]!.replace(/monday/i, 'Sunday');
    expect(t.labels[1]).toBe('Sunday');
  });
});

describe('附件持久化（v1.15：IDB 镜像 + 保存 GC）', () => {
  it('referencedAttachmentKeys：只收集仍被引用的附件键', async () => {
    const { referencedAttachmentKeys } = await import('../src/assets');
    const topics = [
      { href: 'xap:attachments/a.pdf' },
      { href: 'xap:attachments/b.txt' },
      { href: 'https://example.com' },
      { href: '' }
    ];
    const keys = referencedAttachmentKeys(topics);
    expect(keys.size).toBe(2);
    expect(keys.has('attachments/a.pdf')).toBe(true);
    expect(keys.has('attachments/b.txt')).toBe(true);
    expect(referencedAttachmentKeys([{ href: '' }]).size).toBe(0);
  });
});

describe('v1.16：timeline 变体 / 图例 / 主题包', () => {
  it('timeline-sided：事件全在轴上方；timeline-rtl：全在轴向左', () => {
    const s = buildSheet('timeline-sided', [1, 1, 1]);
    applySheet(s);
    const eng = StructureEngines['timeline-sided']!;
    const m = eng.measure(fakeCtx) as { blocks: Map<string, any> };
    const pos = eng.arrange(fakeCtx, m);
    for (const c of s.root.children) expect(pos.get(c.id)!.y).toBeLessThan(0);
    const s2 = buildSheet('timeline-rtl', [1, 1]);
    applySheet(s2);
    const eng2 = StructureEngines['timeline-rtl']!;
    const m2 = eng2.measure(fakeCtx) as { blocks: Map<string, any> };
    const pos2 = eng2.arrange(fakeCtx, m2);
    for (const c of s2.root.children) expect(pos2.get(c.id)!.x).toBeLessThan(0);
  });
  it('timeline-through：主题串在轴上（x≈0）；btt：竖轴自下而上', () => {
    const s = buildSheet('timeline-through', [1, 1]);
    applySheet(s);
    const eng = StructureEngines['timeline-through']!;
    const m = eng.measure(fakeCtx) as { blocks: Map<string, any> };
    const pos = eng.arrange(fakeCtx, m);
    for (const c of s.root.children) expect(Math.abs(pos.get(c.id)!.x)).toBeLessThan(1);
    const s2 = buildSheet('timeline-vertical-btt', [1]);
    applySheet(s2);
    const eng2 = StructureEngines['timeline-vertical-btt']!;
    const m2 = eng2.measure(fakeCtx) as { blocks: Map<string, any> };
    const pos2 = eng2.arrange(fakeCtx, m2);
    expect(pos2.get(s2.root.children[0]!.id)!.y).toBeLessThan(0);   // 根下方的事件变到上方
  });
  it('图例序列化回路：visibility/position/markers 含义', () => {
    const s = buildSheet('logic-chart', [1]);
    s.root.children[0]!.markers = ['priority-1'];
    s.legend = { visibility: 'visible', position: { x: -220, y: 340 }, meanings: { 'priority-1': '最高优先' } };
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].legend).toEqual({
      visibility: 'visible', position: { x: -220, y: 340 }, markers: { 'priority-1': '最高优先' }
    });
    const r = fromJSON(j);
    expect(r.legend?.meanings['priority-1']).toBe('最高优先');
    expect(r.legend?.visibility).toBe('visible');
  });
  it('主题包：43 个 Xmind 官方主题已移植；双向转换回路', async () => {
    const { PORTED_PRESETS, xmindThemeToPreset, presetToXmindTheme } = await import('../src/theme-presets');
    expect(PORTED_PRESETS.length).toBe(43);
    expect(PORTED_PRESETS.find(p => p.id === 'x-B01')?.label).toBe('黑板');
    expect(PORTED_PRESETS.filter(p => p.paper).length).toBeGreaterThanOrEqual(38);   // 40 个带背景（容差）
    // 导出 → 再导入：label/角色/纸色保持
    const b01 = PORTED_PRESETS.find(p => p.id === 'x-B01')!;
    const back = xmindThemeToPreset(JSON.parse(presetToXmindTheme(b01)));
    expect(back?.label).toBe('黑板');
    expect(back?.paper).toBe('#1e2933');
    expect(back?.roles.root.text).toBe(b01.roles.root.text);
  });
  it('换主题只清掉与旧角色相同的样式，绘制按当前层级取色', () => {
    const s = buildSheet('logic-chart', [1]);
    const l1 = s.root.children[0]!;
    const deep = l1.children[0]!;
    l1.style = { shape: 'roundedRect', lineClass: 'curve', fill: '#112233' };
    deep.style = { shape: 'roundedRect', text: '#e5eef9' };
    s.themeClass = 'classic';
    applySheet(s);
    releaseThemePaint(s.root, getTheme('classic'));
    expect(l1.style.shape).toBeUndefined();
    expect(l1.style.lineClass).toBeUndefined();
    expect(l1.style.fill).toBe('#112233');
    expect(deep.style.shape).toBeUndefined();
    expect(deep.style.text).toBe('#e5eef9');

    s.themeClass = 'x-B01';
    applySheet(s);
    expect(effectiveStyle(deep).text).toBe('#e5eef9');
    expect(effectiveStyle(deep).shape).toBe('roundedRect');
    expect(effectiveStyle(s.root).text).toBeUndefined();

    deep.style.text = '#E5EEF9';
    deep.style.shape = 'roundedRect';
    deep.style.fill = '#F4D607';
    releaseThemePaint(s.root, getTheme('x-B01'));
    expect(deep.style.text).toBeUndefined();
    expect(deep.style.shape).toBeUndefined();
    expect(deep.style.fill).toBe('#F4D607');

    s.themeClass = 'classic';
    applySheet(s);
    expect(deep.style.shape).toBeUndefined();
    expect(effectiveStyle(deep).shape).toBe('roundedRect');
    expect(effectiveStyle(deep).text).toBeUndefined();
    expect(effectiveStyle(deep).fill).toBe('#F4D607');
  });
  it('旧种子标题「枝桠 · 自制思维导图」打开时改回枝桠', () => {
    const s = buildSheet('logic-chart', [0]);
    s.root.title = '枝桠 · 自制思维导图';
    s.root.children[0]!.title = '仍保留的标题';
    renameLegacyTitles(s.root);
    expect(s.root.title).toBe('枝桠');
    expect(s.root.children[0]!.title).toBe('仍保留的标题');
  });
  it('打开经典主题时清掉其他主题残留的字色和填充', () => {
    const s = buildSheet('logic-chart', [1]);
    const l1 = s.root.children[0]!;
    const deep = l1.children[0]!;
    deep.style = { text: '#e5eef9', fill: '#E2E9F1', shape: 'underline' };
    l1.style = { fill: '#112233', text: '#ABCDEF' };
    s.themeClass = 'classic';
    applySheet(s);
    releaseStaleThemePaint(s.root);
    expect(deep.style.text).toBeUndefined();
    expect(deep.style.fill).toBeUndefined();
    expect(deep.style.shape).toBe('underline');
    expect(l1.style.fill).toBe('#112233');
    expect(l1.style.text).toBe('#ABCDEF');
    expect(effectiveStyle(deep).text).toBeUndefined();
    expect(effectiveStyle(deep).fill).toBeUndefined();
  });
  it('timeline 变体类名映射回路', () => {
    const pairs = [
      ['timeline-rtl', 'org.xmind.ui.timeline.horizontal.rtl'],
      ['timeline-sided', 'org.xmind.ui.timeline.sided.horizontal'],
      ['timeline-sided-rtl', 'org.xmind.ui.timeline.sided.horizontal.rtl'],
      ['timeline-vertical-btt', 'org.xmind.ui.timeline.vertical.btt'],
      ['timeline-through', 'org.xmind.ui.timeline.through.vertical'],
      ['timeline-through-btt', 'org.xmind.ui.timeline.through.vertical.btt']
    ];
    for (const [id, full] of pairs) {
      const s = buildSheet(id, [1]);
      applySheet(s);
      const j = JSON.parse(JSON.stringify(toJSON()));
      expect(j.sheets[0].structureClass, id).toBe(full);
      expect(fromJSON(j).structureClass, id).toBe(id);
    }
  });
});

describe('v1.17：表格系结构（树表格 / 矩阵 / 电子表格）', () => {
  it('treetable：行按深度缩进（depth2 在 depth1 右侧），行分隔线存在', () => {
    const s = buildSheet('treetable', [2, 1]);
    applySheet(s);
    const eng = StructureEngines['treetable']!;
    const pos = eng.arrange(fakeCtx, eng.measure(fakeCtx));
    const h1 = pos.get(s.root.children[0]!.id)!;
    const h2 = pos.get(s.root.children[0]!.children[0]!.id)!;
    expect(h2.x).toBeGreaterThan(h1.x + 20);          // 缩进
    expect(h2.y).toBeGreaterThan(h1.y);               // 下行
    expect(eng.decorEdges!(pos)).toContain(' L ');    // 行线
    expect(StructureEngines['treetable-toptitle']).toBeTruthy();
  });
  it('spreadsheet：列头同高对齐，同行单元格 y 对齐', () => {
    const s = buildSheet('spreadsheet', [2, 1]);
    applySheet(s);
    const eng = StructureEngines['spreadsheet']!;
    const pos = eng.arrange(fakeCtx, eng.measure(fakeCtx));
    const c0 = pos.get(s.root.children[0]!.id)!;
    const c1 = pos.get(s.root.children[1]!.id)!;
    expect(c0.y).toBeCloseTo(c1.y, 0);                // 表头同一行
    const cell00 = pos.get(s.root.children[0]!.children[0]!.id)!;
    const cell10 = pos.get(s.root.children[1]!.children[0]!.id)!;
    expect(cell00.y).toBeCloseTo(cell10.y, 0);        // 第 0 行跨列对齐
    expect(cell10.x).toBeGreaterThan(cell00.x + 40);  // 第 1 列在第 0 列右侧
    const decor = eng.decorEdges!(pos);
    expect((decor.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(1);   // 表头底纹
  });
  it('grid：矩阵带斑马行；spreadsheet-column：转置后行头同列对齐', () => {
    const s = buildSheet('grid', [2]);
    applySheet(s);
    const eng = StructureEngines['grid']!;
    const pos = eng.arrange(fakeCtx, eng.measure(fakeCtx));
    expect((eng.decorEdges!(pos).match(/fill-opacity/g) ?? []).length).toBeGreaterThanOrEqual(2);  // 表头+斑马
    const s2 = buildSheet('spreadsheet-column', [1, 2]);
    applySheet(s2);
    const eng2 = StructureEngines['spreadsheet-column']!;
    const pos2 = eng2.arrange(fakeCtx, eng2.measure(fakeCtx));
    const r0 = pos2.get(s2.root.children[0]!.id)!;
    const r1 = pos2.get(s2.root.children[1]!.id)!;
    expect(r0.x).toBeCloseTo(r1.x, 0);                // 行头同列
    expect(r1.y).toBeGreaterThan(r0.y + 20);          // 纵向排列
    const cell = pos2.get(s2.root.children[1]!.children[0]!.id)!;
    expect(cell.x).toBeGreaterThan(r1.x + 30);        // 单元格在行头右侧
  });
  it('表格系类名映射双向回路（5 引擎）', () => {
    const pairs = [
      ['treetable', 'org.xmind.ui.treetable'],
      ['treetable-toptitle', 'org.xmind.ui.treetable.toptitle'],
      ['spreadsheet', 'org.xmind.ui.spreadsheet'],
      ['spreadsheet-column', 'org.xmind.ui.spreadsheet.column'],
      ['grid', 'org.xmind.ui.grid']
    ];
    for (const [id, full] of pairs) {
      const s = buildSheet(id, [1]);
      applySheet(s);
      const j = JSON.parse(JSON.stringify(toJSON()));
      expect(j.sheets[0].structureClass, id).toBe(full);
      expect(fromJSON(j).structureClass, id).toBe(id);
    }
  });
});

describe('REA 对齐：外框/连线/扩展/导入', () => {
  it('roundedElbow 连线类往返', () => {
    const p = styleToProperties({ lineClass: 'roundedElbow' });
    expect(p['line-class']).toBe('org.xmind.branchConnection.roundedElbow');
    expect(styleFromProperties(p).lineClass).toBe('roundedElbow');
  });
  it('boundaries[] 序列化回路', () => {
    const s = buildSheet('logic-chart', [2]);
    const p = s.root;
    p.boundaries = [{ id: 'b1', rangeStart: 0, rangeEnd: 1, title: '框' }];
    applySheet(s);
    const j = JSON.parse(JSON.stringify(toJSON()));
    expect(j.sheets[0].rootTopic.boundaries[0].range).toBe('(0,1)');
    const back = fromJSON(j);
    expect(back.root.boundaries[0]?.rangeEnd).toBe(1);
  });
  it('官方 mind_map 骨架 extension → map.clockwise', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = fs.readFileSync(path.join('test/fixtures/xmind-templates/mind_map/content.json'), 'utf8');
    const sh = JSON.parse(raw)[0];
    const sheet = fromJSON({ sheets: [sh] });
    expect(sheet.structureClass).toBe('map-clockwise');
    expect(sheet.topicOverlapping).toBe('overlap');
  });
  it('Markdown 导入解析', async () => {
    const { markdownToZhiyaJSON } = await import('../src/markdown-import');
    const j = markdownToZhiyaJSON('# 根\n- A\n  - B');
    expect(j.sheets![0]!.rootTopic!.title).toBe('根');
    expect(j.sheets![0]!.rootTopic!.children!.attached!.length).toBe(1);
  });
});
