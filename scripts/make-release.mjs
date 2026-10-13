// make-release.mjs — 打包绿色便携包：release/枝桠-v{版本}.zip
//   枝桠.html + 启动枝桠.bat + zhiya-server.ps1 + 启动枝桠.command + 使用说明.md
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const ver = pkg.version;

execSync('npm run build', { cwd: root, stdio: 'inherit' });

const relDir = path.join(root, 'release');
fs.rmSync(relDir, { recursive: true, force: true });
fs.mkdirSync(relDir, { recursive: true });

fs.copyFileSync(path.join(root, 'dist', 'index.html'), path.join(relDir, '枝桠.html'));
fs.copyFileSync(path.join(root, '使用说明.md'), path.join(relDir, '使用说明.md'));
const launcherDir = path.join(root, 'scripts', 'launcher');
for (const f of ['启动枝桠.bat', '启动枝桠.command']) {
  fs.copyFileSync(path.join(launcherDir, f), path.join(relDir, f));
}
// ps1 必须带 UTF-8 BOM（PowerShell 5.1 无 BOM 按 ANSI 解析，中文会炸语法）
const ps1 = fs.readFileSync(path.join(launcherDir, 'zhiya-server.ps1'));
if (ps1[0] !== 0xEF || ps1[1] !== 0xBB || ps1[2] !== 0xBF) {
  fs.writeFileSync(path.join(relDir, 'zhiya-server.ps1'), Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), ps1]));
} else {
  fs.copyFileSync(path.join(launcherDir, 'zhiya-server.ps1'), path.join(relDir, 'zhiya-server.ps1'));
}

const zipName = `枝桠-v${ver}.zip`;
const ps = (p) => `'${path.resolve(relDir, p).replace(/'/g, "''")}'`;
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path ${ps('枝桠.html')}, ${ps('使用说明.md')}, ${ps('启动枝桠.bat')}, ${ps('zhiya-server.ps1')}, ${ps('启动枝桠.command')} -DestinationPath ${ps(zipName)} -Force"`,
  { stdio: 'inherit' }
);

const zipPath = path.join(relDir, zipName);
const size = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`\n✓ 绿色便携包就绪：release/${zipName}（${size} KB）`);
console.log('  使用方法：解压 → 双击「启动枝桠.bat」→ 浏览器自动打开（完整功能）');
