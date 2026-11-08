# 共页 · PPT Coedit

基于 GrapesJS 0.23.9 的可运行原型。使用 TypeScript + Vite 搭建首版外壳，先验证编辑和协作模型；暂未引入 React、外部模型或 HTML-in-Canvas。

## 启动

在工作区根目录 PowerShell 执行：

```powershell
. .\scripts\activate-dev.ps1
Set-Location ppt-coedit
npm run dev
```

访问 http://127.0.0.1:5173 。依赖已安装并锁定在 package-lock.json。

## 当前功能

- 多页创建、切换、删除，固定 1280×720 画布与缩放。
- 新增文字、卡片和本地图片，选择、拖动、缩放、样式面板和图层。
- 对象锁定与 Agent 锁检查；局部文本及样式修改。
- 单调 revision、过期请求拒绝、requestId 会话内幂等。
- 统一快照撤销/重做按钮、本地自动保存及刷新恢复。
- HTML/CSS 导入为新页、独立 HTML 导出与翻页放映。

## 箭头与连接线（X6）

点击「↗ 箭头」插入，进入图形编辑模式；选中线条后，两端白色圆点可独立拖动。工具栏可切换直线、曲线和圆角折线，调整颜色、粗细、单向/双向箭头及虚线。曲线和折线提供折点工具。

「完成编辑」收起箭头工具栏，箭头仍可直接选中和移动：拖动线身整体平移，起点、终点和曲线折点同步移动；拖两端圆点则只调整对应端点。点击箭头会重新打开工具栏，也可使用「编辑箭头」按钮。箭头以外的透明区域允许直接选择底下的文字或图片，不再需要手动切换模式。一次拖动在松手后保存为一次可撤销操作。

可编辑的 X6 JSON 和静态 SVG 共同存入 GrapesJS 文稿，刷新后可继续编辑；导出 HTML 直接展示 SVG，不需要 X6 运行环境，也不带端点控制柄。目前图形统一位于 HTML 内容上方；连接 HTML 对象自动跟随、跨图层排序、形状节点及多人并发尚未实现。

## 文字、图片与布局操作

- 选中对象后，中间画布顶部显示快捷工具栏：字号、颜色、加粗、文字对齐。
- 对象层级路径可直接点击；使用「进入内部 ↓」选择首个子对象、「选择父级 ↑」或 Esc 返回父级。Alt + 单击可直接选中深层元素，配合图层面板选择其他子对象。
- 自由定位对象：方向键移动 1px，Shift + 方向键移动 10px。输入文字、操作输入框时不会触发对象微调。
- Flex/Grid 子元素保持流式布局，不强制改成绝对定位。选择 Flex/Grid 容器后可在工具栏调整 gap 间距。
- 选择图片后点击「替换图片」，读取本地图片并保留原位置和尺寸，支持撤销。
- 工具栏显示当前布局类型及锁定状态。工具栏修改尊重父级锁；右侧原生属性面板的严格锁策略仍待完善。

快捷工具栏和右侧样式面板默认只修改选中的对象，优先使用对象独立样式，避免修改共享 class 导致其他文本框变化。

### 单字与段落格式

选中文本框后点击「精细文字编辑」，可选择「整个文本框」「当前段落」「选中文字」三个范围。在编辑窗口里拖选一个字或一段文字后，可调整字体、字号、颜色、加粗和字距；选择当前段落可设置行高、段后距、左对齐、居中或右对齐。文字选区在点击工具按钮或输入字号时会保留。

行高、段后距和对齐属于段落属性；即使选中单字，这三项也作用于所在段落。保存时只更新打开的这个文本框，并作为一次可撤销操作；取消不写回。若原文本框被 Agent 等操作改动，保存会拒绝覆盖，需重新打开。精细格式当前在独立编辑窗口内操作，画布内仍可双击进行基本文字修改。

保存精细文字时会归一化行内格式：合并相邻的相同样式、清理冗余嵌套，取消加粗后不保留无意义的加粗/普通样式套层。格式片段不作为独立画布对象或图层，整个文本框仍可统一选择和移动。旧文稿中已经产生的冗余行内格式，可选中外层文本框，打开「精细文字编辑」后保存一次进行整理；段落、链接和非文字对象的结构会保留。

当前微调按一次按键记一条撤销记录，长按合并为一个手势事务尚未实现。

## 打开已有 HTML PPT 文件

点击顶部 **打开 HTML PPT**，选择 `.html` 文件；如果图片、CSS 或字体是相对路径，再选择包含它们的资源文件夹。点击 **导入页面**，页面会追加到当前文稿，整次导入可以撤销。

支持识别 reveal.js 的水平/垂直 section、`.slide-root`、`.slide`、`[data-slide]` 和 body 下的 section；未发现分页则作为单页。导入后保留 DOM，可双击编辑标题，也可由 Agent 局部改稿。每页 CSS 限定作用范围，导入对象 ID 重新命名以避免和已有文稿冲突。

本地图片、CSS 和字体文件会尽量内嵌。缺失的本地资源、未加载的外部样式表和脚本依赖会显示在导入报告中；不会自动执行来源文件中的 JavaScript。远程图片等 URL 仍依赖网络。使用 1280×720 画布，依赖运行时脚本的内容或不同尺寸的布局需要人工调整。

本会话预览地址：http://127.0.0.1:5173 。如受限环境中 Vite 开发依赖预打包遇到目录权限问题，可运行 `npm run build`，再运行 `npm run preview -- --port 5173` 使用构建预览。

## Agent 接口

打开右侧 Agent 页签，可生成并应用选中对象的示例事务。也可从页面脚本调用：

```js
const state = window.pptAgent.inspect();
window.pptAgent.apply({
  baseRevision: state.revision,
  requestId: crypto.randomUUID(),
  patches: [{ id: state.selection[0], text: '新标题', style: { color: '#2563eb' } }],
});
```

修改真实 GrapesJS 模型，手工编辑和 Agent 修改共用历史。所有目标及锁先校验再提交，发生异常恢复事务前快照。外部 MCP/HTTP 桥接尚未实现，不能直接从远程调用该页面对象。

## 验证

```powershell
npm test
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Split-Path (Get-Location) -Parent) '.cache/playwright'
# 保持 npm run dev 在另一终端运行
node tests/browser.mjs
node tests/import-browser.mjs
node tests/editing-browser.mjs
node tests/arrows-browser.mjs
node tests/arrow-move-browser.mjs
node tests/text-format-browser.mjs
node tests/text-normalize-browser.mjs
```

浏览器闭环覆盖对象创建、Agent 修改、重复请求、版本冲突、撤销重做、刷新恢复、页面和放映。测试在独立浏览器上下文内执行，不改日常浏览器存档；截图输出 preview.png。

## 首版边界与下一步

完整的开源代码使用量与百分比见文末「开源项目复用统计」。

- 当前页面列表是文字列表，尚未实现真实缩略图、排序和页面复制。
- 富文本、复杂嵌套布局、中文输入法及拖动手势的历史分组仍需专项验证；撤销以按钮操作为准，暂未统一 iframe 内的快捷键。
- 锁主要限制对象几何操作及 Agent 写入；后代的人工文字/样式编辑还需补齐严格锁策略。
- CSS 选择器使用语法树处理，支持含逗号的 :is() 等选择器及分组规则；文件导入停用动画并提示。复杂 CSS 嵌套、SVG 内部引用及脚本布局仍需专项适配，不承诺任意网页 HTML/CSS 无损导入。
- 文本 patch 限于没有结构子元素的文字对象，避免替换整个卡片结构。修改含多段富文本的对象应后续增加精确文本命令。
- 工程使用 localStorage 与图片 data URL，适合验证；后续迁移到 IndexedDB + Blob。存储失败会显示状态。历史只在本次会话保留，刷新恢复内容不恢复历史。
- 快照历史暂不限制长度，后续增加容量控制。复杂大文稿尚未做性能基准。
- PDF、可编辑 PPTX、多人协作、稳定的外部 Agent 工具桥接尚未实现。

下一阶段优先实现：严格的自由/流式布局契约、手势事务与锁策略、IndexedDB 存储、页面缩略图与排序，然后接外部 Agent 桥接。

## 开源项目复用统计

统计时间：2026-11-08T11:34:58.193Z。当前实际通过 npm 接入 **GrapesJS、AntV X6、PostCSS、postcss-selector-parser**，未从 clone 的仓库直接复制实现代码。X6 的已安装版本见 package-lock.json。其他已克隆仓库仍为调研参考。

### 占原项目与本项目维护源码的比例

此处“源码复用比例”明确指直接复制/修改上游源码并放入本项目维护目录的比例；通过 npm 调用的实际代码量另见下表。

| 原项目 | 实际使用方式 | 直接复制/修改代码量 | 占原项目源码 | 占本项目维护源码 |
| --- | --- | --- | --- | --- |
| GrapesJS | npm 运行入口 + 编辑器 CSS | 0 行 | 0% | 0% |
| AntV X6 | npm；端点编辑、曲线、折线、SVG 图形 | 0 行 | 0% | 0% |
| PostCSS / postcss-selector-parser | npm；CSS 解析及选择器改写 | 各 0 行 | 各 0% | 各 0% |
| GrapesJS WebMCP | 未接入，协作接口由本项目实现 | 0 行 | 0% | 0% |
| PPTist | 交互和实现思路参考 | 0 行 | 0% | 0% |
| Moveable / Selecto | 已 clone，未调用 | 各 0 行 | 各 0% | 各 0% |
| reveal.js | 仅兼容其 HTML 分页结构，未引入运行代码 | 0 行 | 0% | 0% |
| slide-editor / PptxGenJS | 已 clone，未调用 | 各 0 行 | 各 0% | 各 0% |
| Scena / Slidev / Yjs | 调研候选，未接入 | 各 0 行 | 各 0% | 各 0% |

这不表示 GrapesJS/X6 没有被使用。对于 npm 依赖，**使用了原仓库整体多少源码或多少执行路径，目前未测覆盖率**；不会把引入入口写成“使用整个原项目 100%”。仓库还包含测试、工具和文档，不能以 API 调用数量推断源码覆盖率。

本项目维护的运行源码（src + index.html）共 **9 个文件、604 个非空物理行、69,230 UTF-8 字节**。不含测试、配置、脚本、文档、node_modules 和 dist；紧凑排版下行数不代表开发工作量。

### 占当前应用运行时 JavaScript 的比例

分母为 Rollup renderedLength 合计 **4,629,848 个字符**，即 tree-shaking 后、最终 chunk 压缩前的模块代码量。不是下载体积、gzip 大小、执行覆盖率、功能贡献或开发投入占比。CommonJS 辅助模块按来源包归属；GrapesJS 发布文件内自带的依赖未再细分。

| 来源 | 构建 JS 字符数 | 占当前运行时 JS |
| --- | ---: | ---: |
| grapesjs | 2,771,908 | 59.870% |
| @antv/x6 | 1,254,793 | 27.102% |
| lodash-es | 178,023 | 3.845% |
| postcss-selector-parser | 155,635 | 3.362% |
| postcss | 128,045 | 2.766% |
| application | 57,724 | 1.247% |
| mousetrap | 35,845 | 0.774% |
| dom-align | 35,718 | 0.771% |
| cssesc | 3,690 | 0.080% |
| tslib | 2,688 | 0.058% |
| vite-runtime | 2,353 | 0.051% |
| util-deprecate | 1,832 | 0.040% |
| picocolors | 885 | 0.019% |
| nanoid | 709 | 0.015% |
| WebMCP、PPTist、Moveable、Selecto、reveal.js、slide-editor、PptxGenJS、Scena、Slidev、Yjs | 各 0 | 各 0% |

四舍五入可能导致合计略有误差。TypeScript、Vite 构建器和 Playwright 测试框架不计入浏览器运行代码，Vite 的浏览器辅助代码单独列出。

CSS 按两份输入文件单独统计：GrapesJS 样式 **61,053 字节，89.72%**；本项目样式 **6,993 字节，10.28%**。X6 在 JS 内注入的样式随其 JS 统计，此处不是全部最终样式的逐来源占比。

原始数据：[reuse-audit.json](./reuse-audit.json)。重跑并更新本节：

```powershell
node scripts/audit-reuse.mjs
node scripts/update-reuse-readme.mjs
```

统计脚本在内存中构建，不改写 dist。构建中的包体积占比不能代替功能完成度或工作量评价。
