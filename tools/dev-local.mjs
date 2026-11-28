import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(REPO_ROOT, 'apps', 'api');
const WEB_DIR = path.join(REPO_ROOT, 'apps', 'web');

const TSX_LOADER_PATH = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs');
const TSX_LOADER_URL = pathToFileURL(TSX_LOADER_PATH).href;
const VITE_CLI = path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const PRISMA_CLIENT_ENTRY = path.join(
  REPO_ROOT,
  'node_modules',
  '.prisma',
  'client',
  'index.js'
);

function ensurePrismaGenerated() {
  if (fs.existsSync(PRISMA_CLIENT_ENTRY)) return;
  console.log('[dev:local] عميل Prisma غير مولّد بعد — جاري التوليد تلقائياً...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const res = spawnSync(npmCmd, ['run', 'db:generate'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

async function waitForHealth(getHealthUrl, apiProc, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (apiProc.exitCode !== null) {
      throw new Error(`توقف الخادم الخلفي مبكراً برمز خروج ${apiProc.exitCode}`);
    }
    try {
      const res = await fetch(getHealthUrl());
      if (res.ok) return;
    } catch {
      // retry until API listens
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`انتهت مهلة انتظار الخادم الخلفي على ${getHealthUrl()}`);
}

async function main() {
  if (!fs.existsSync(TSX_LOADER_PATH) || !fs.existsSync(VITE_CLI)) {
    console.error('[dev:local] يرجى تشغيل npm install في جذر المشروع أولاً.');
    process.exit(1);
  }

  ensurePrismaGenerated();

  const apiPort = process.env.PORT || '3000';
  const apiHost = process.env.HOST || '127.0.0.1';
  let healthUrl = `http://${apiHost}:${apiPort}/api/v1/health`;

  const apiProc = spawn(process.execPath, ['--import', TSX_LOADER_URL, 'src/local.ts'], {
    cwd: API_DIR,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: process.env,
  });

  apiProc.on('message', (msg) => {
    if (msg && typeof msg === 'object' && msg.type === 'darb:api-ready' && typeof msg.url === 'string') {
      healthUrl = `${msg.url}/api/v1/health`;
    }
  });

  let webProc = null;
  let shuttingDown = false;

  const shutdownAll = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (webProc && webProc.exitCode === null) {
      webProc.kill();
    }

    if (apiProc.exitCode === null) {
      await new Promise((resolve) => {
        const forceTimer = setTimeout(() => {
          if (apiProc.exitCode === null) apiProc.kill();
          resolve();
        }, 4500);

        apiProc.once('exit', () => {
          clearTimeout(forceTimer);
          resolve();
        });

        try {
          if (apiProc.connected) {
            apiProc.send({ type: 'darb:shutdown' });
          } else {
            apiProc.kill('SIGINT');
          }
        } catch {
          apiProc.kill();
        }
      });
    }

    process.exit(exitCode);
  };

  process.on('SIGINT', () => void shutdownAll(0));
  process.on('SIGTERM', () => void shutdownAll(0));
  process.on('message', (msg) => {
    if (msg && typeof msg === 'object' && msg.type === 'darb:shutdown') {
      void shutdownAll(0);
    }
  });

  apiProc.on('exit', (code) => {
    if (!shuttingDown) {
      if (code !== 0) {
        console.error(`[dev:local] أُغلق الخادم الخلفي بشكل غير متوقع (code=${code})`);
      }
      void shutdownAll(code ?? 1);
    }
  });

  try {
    await waitForHealth(() => healthUrl, apiProc);
  } catch (err) {
    console.error('[dev:local] فشل إقلاع الخادم المحلي:', err);
    await shutdownAll(1);
    return;
  }

  webProc = spawn(
    process.execPath,
    [VITE_CLI, '--host', '127.0.0.1', '--port', '4173'],
    {
      cwd: WEB_DIR,
      stdio: 'inherit',
      env: process.env,
    }
  );

  console.log('');
  console.log('🌐 الواجهة الأمامية التفاعلية متاحة على: http://127.0.0.1:4173');
  console.log('💡 لإيقاف الخادمين وحفظ القاعدة المحلية بأمان: اضغط Ctrl+C');
  console.log('');

  webProc.on('exit', (code) => {
    if (!shuttingDown) {
      void shutdownAll(code ?? 0);
    }
  });
}

main().catch((err) => {
  console.error('[dev:local] خطأ غير متوقع:', err);
  process.exit(1);
});
