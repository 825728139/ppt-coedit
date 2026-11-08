import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const groups = new Map();
const local = { files: 0, nonEmptyLines: 0, bytes: 0 };
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(ts|css|html)$/.test(entry.name)) {
      const source = fs.readFileSync(file, 'utf8');
      local.files++; local.nonEmptyLines += source.split(/\r?\n/).filter(line => line.trim()).length;
      local.bytes += Buffer.byteLength(source);
    }
  }
}
scan(path.join(root, 'src'));
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
local.files++; local.nonEmptyLines += index.split(/\r?\n/).filter(line => line.trim()).length; local.bytes += Buffer.byteLength(index);

await build({
  root, write: false, logLevel: 'silent',
  plugins: [{ name: 'reuse-audit', generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk') continue;
      for (const [id, module] of Object.entries(chunk.modules)) {
        const normalized = id.replaceAll('\\', '/');
        const match = normalized.match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/);
        const name = match ? match[1] : normalized.includes('/src/') ? 'application' : 'vite-runtime';
        const group = groups.get(name) || { modules: 0, renderedCharacters: 0 };
        group.modules++; group.renderedCharacters += module.renderedLength;
        groups.set(name, group);
      }
    }
  } }],
});
const total = [...groups.values()].reduce((sum, value) => sum + value.renderedCharacters, 0);
const report = {
  generatedAt: new Date().toISOString(),
  metric: 'Rollup renderedLength characters, after tree-shaking and before final chunk minification; JS only',
  localSource: local,
  runtimeJavaScript: { totalRenderedCharacters: total, groups: Object.fromEntries([...groups].sort((a,b) => b[1].renderedCharacters-a[1].renderedCharacters).map(([name, value]) => [name, { ...value, percent: Number((value.renderedCharacters / total * 100).toFixed(3)) }])) },
  cssInputs: Object.fromEntries(['src/style.css', 'node_modules/grapesjs/dist/css/grapes.min.css'].map(file => [file, fs.statSync(path.join(root, file)).size])),
};
fs.writeFileSync(path.join(root, 'reuse-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
