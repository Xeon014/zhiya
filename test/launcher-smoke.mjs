// launcher-smoke.mjs — 绿色便携包启动器冒烟：起 PowerShell 服务 → curl 200 + 完整内容 → kill
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(root, 'dist', 'index.html');
const LAUNCHER = path.join(root, 'scripts', 'launcher', 'zhiya-server.ps1');
const PORT = 8790;
const errs = [];
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + m); if (!c) errs.push(m); };

if (!fs.existsSync(DIST)) { console.error('请先 npm run build'); process.exit(1); }

// 在 dist 目录放一份带启动器的便携包形态（测后清理）
fs.copyFileSync(DIST, path.join(root, 'dist', '枝桠.html'));
fs.copyFileSync(LAUNCHER, path.join(root, 'dist', 'zhiya-server.ps1'));

const ps = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'dist', 'zhiya-server.ps1'), '-Port', String(PORT)], { cwd: path.join(root, 'dist'), stdio: 'pipe' });
let out = '';
ps.stdout.on('data', d => out += d);
ps.stderr.on('data', d => out += d);

await new Promise(r => setTimeout(r, 2500));

try {
  const res = execSync(`curl -s -o NUL -w "%{http_code}" http://127.0.0.1:${PORT}/`, { shell: 'cmd.exe' }).toString().trim();
  ok(res === '200', `根路径 HTTP ${res}（期望 200）`);
  const body = execSync(`curl -s http://127.0.0.1:${PORT}/`, { shell: 'cmd.exe', maxBuffer: 10 * 1024 * 1024 }).toString();
  ok(body.includes('<!DOCTYPE html>') && body.includes('data:application/manifest+json') && body.includes('黑板'),
    `服务内容为完整应用（${(body.length / 1024).toFixed(0)}KB，含 manifest/主题）`);
  const res404 = execSync(`curl -s -o NUL -w "%{http_code}" http://127.0.0.1:${PORT}/../package.json`, { shell: 'cmd.exe' }).toString().trim();
  ok(res404 === '404', `目录穿越防护（../package.json → ${res404}）`);
} catch (e) {
  ok(false, '请求失败: ' + e.message);
} finally {
  ps.kill('SIGKILL');
  try { if (ps.exitCode === null) execSync(`taskkill /PID ${ps.pid} /T /F`, { shell: 'cmd.exe', stdio: 'ignore' }); } catch {}
  fs.rmSync(path.join(root, 'dist', '枝桠.html'), { force: true });
  fs.rmSync(path.join(root, 'dist', 'zhiya-server.ps1'), { force: true });
  ok(out.includes('127.0.0.1'), '启动器控制台输出地址提示');
}

console.log(errs.length ? 'FAILED: ' + errs.join('; ') : 'LAUNCHER SMOKE PASSED');
process.exit(errs.length ? 1 : 0);
