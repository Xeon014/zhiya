// Pack fixture folders (content.json + manifest) into .xmind ZIPs for marathon.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip } from '../src/zip.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'xmind-templates');
const enc = new TextEncoder();

for (const name of fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
  const dir = path.join(root, name);
  const contentPath = path.join(dir, 'content.json');
  if (!fs.existsSync(contentPath)) continue;
  const content = fs.readFileSync(contentPath);
  const manifest = fs.readFileSync(path.join(dir, 'manifest.json'));
  const metadata = fs.existsSync(path.join(dir, 'metadata.json'))
    ? fs.readFileSync(path.join(dir, 'metadata.json'))
    : enc.encode(JSON.stringify({ dataStructureVersion: '3', layoutEngineVersion: '5' }));
  const zip = buildZip([
    { name: 'content.json', data: content },
    { name: 'manifest.json', data: manifest },
    { name: 'metadata.json', data: metadata },
  ]);
  const out = path.join(root, `${name}.xmind`);
  fs.writeFileSync(out, zip);
  console.log('packed', out);
}
