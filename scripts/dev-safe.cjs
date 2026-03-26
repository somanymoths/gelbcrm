const fs = require('fs');
const path = require('path');
const { spawn, execSync, execFileSync } = require('child_process');

function isRunningNextDevInRepo(repoRoot) {
  let output = '';
  try {
    output = execSync('ps -ax -o pid=,command=', { encoding: 'utf8' });
  } catch {
    return [];
  }

  const marker = `${repoRoot}/node_modules/.bin/next dev`;
  const rows = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return rows
    .filter((line) => line.includes(marker))
    .map((line) => {
      const firstSpace = line.indexOf(' ');
      const pid = firstSpace === -1 ? line : line.slice(0, firstSpace);
      return { pid, command: line.slice(firstSpace + 1) };
    });
}

function clearNextCache(repoRoot) {
  const nextDir = path.join(repoRoot, '.next-dev');
  fs.rmSync(nextDir, { recursive: true, force: true });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runEnvPreflight(repoRoot) {
  const preflightPath = path.join(repoRoot, 'scripts', 'env-preflight.cjs');
  try {
    execFileSync(process.execPath, [preflightPath], { stdio: 'inherit', env: process.env });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 1;
    process.exit(Number.isFinite(status) ? status : 1);
  }
}

function ensureJournalSectionExists(repoRoot) {
  const journalDir = path.join(repoRoot, 'src', 'components', 'journal');
  const journalPath = path.join(journalDir, 'journal-section.tsx');

  if (fs.existsSync(journalPath)) return;

  console.error('[dev-safe] Не найден src/components/journal/journal-section.tsx.');
  console.error('[dev-safe] Восстановите канонический файл журнала перед запуском dev-сервера.');
  process.exit(1);
}

function run() {
  const repoRoot = process.cwd();
  let running = isRunningNextDevInRepo(repoRoot);

  if (running.length > 0) {
    // Guard against short-lived stale process entries during restart.
    sleep(700);
    running = isRunningNextDevInRepo(repoRoot);
  }

  if (running.length > 0) {
    const pids = running.map((item) => item.pid).join(', ');
    console.error(`[dev-safe] Обнаружен уже запущенный next dev для этого репозитория (PID: ${pids}).`);
    console.error('[dev-safe] Остановите предыдущий процесс и запустите снова.');
    process.exit(1);
  }

  runEnvPreflight(repoRoot);
  clearNextCache(repoRoot);
  ensureJournalSectionExists(repoRoot);

  const nextBin = path.join(repoRoot, 'node_modules', '.bin', 'next');
  const child = spawn(nextBin, ['dev', '--turbopack'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_DIST_DIR: '.next-dev'
    }
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

run();
