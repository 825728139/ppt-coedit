import fs from 'node:fs';
const report = JSON.parse(fs.readFileSync(new URL('../reuse-audit.json', import.meta.url), 'utf8'));
const readme = new URL('../README.md', import.meta.url);
const format = value => value.toLocaleString('en-US');
const rows = Object.entries(report.runtimeJavaScript.groups).map(([name, group]) => `| ${name} | ${format(group.renderedCharacters)} | ${group.percent.toFixed(3)}% |`).join('\n');
const css = report.cssInputs;
const ownCss = css['src/style.css'], vendorCss = css['node_modules/grapesjs/dist/css/grapes.min.css'];
const section = `## 开源项目复用统计

统计时间：${report.generatedAt}。当前实际通过 npm 接入 **GrapesJS、AntV X6、PostCSS、postcss-selector-parser**，未从 clone 的仓库直接复制实现代码。X6 的已安装版本见 package-lock.json。其他已克隆仓库仍为调研参考。

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

本项目维护的运行源码（src + index.html）共 **${report.localSource.files} 个文件、${report.localSource.nonEmptyLines} 个非空物理行、${format(report.localSource.bytes)} UTF-8 字节**。不含测试、配置、脚本、文档、node_modules 和 dist；紧凑排版下行数不代表开发工作量。

### 占当前应用运行时 JavaScript 的比例

分母为 Rollup renderedLength 合计 **${format(report.runtimeJavaScript.totalRenderedCharacters)} 个字符**，即 tree-shaking 后、最终 chunk 压缩前的模块代码量。不是下载体积、gzip 大小、执行覆盖率、功能贡献或开发投入占比。CommonJS 辅助模块按来源包归属；GrapesJS 发布文件内自带的依赖未再细分。

| 来源 | 构建 JS 字符数 | 占当前运行时 JS |
| --- | ---: | ---: |
${rows}
| WebMCP、PPTist、Moveable、Selecto、reveal.js、slide-editor、PptxGenJS、Scena、Slidev、Yjs | 各 0 | 各 0% |

四舍五入可能导致合计略有误差。TypeScript、Vite 构建器和 Playwright 测试框架不计入浏览器运行代码，Vite 的浏览器辅助代码单独列出。

CSS 按两份输入文件单独统计：GrapesJS 样式 **${format(vendorCss)} 字节，${(vendorCss/(vendorCss+ownCss)*100).toFixed(2)}%**；本项目样式 **${format(ownCss)} 字节，${(ownCss/(vendorCss+ownCss)*100).toFixed(2)}%**。X6 在 JS 内注入的样式随其 JS 统计，此处不是全部最终样式的逐来源占比。

原始数据：[reuse-audit.json](./reuse-audit.json)。重跑并更新本节：

\x60\x60\x60powershell
node scripts/audit-reuse.mjs
node scripts/update-reuse-readme.mjs
\x60\x60\x60

统计脚本在内存中构建，不改写 dist。构建中的包体积占比不能代替功能完成度或工作量评价。
`;
const original = fs.readFileSync(readme, 'utf8');
const index = original.indexOf('## 开源项目复用统计');
fs.writeFileSync(readme, original.slice(0, index < 0 ? original.length : index) + section);
