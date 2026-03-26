const fs = require('fs');
const path = require('path');
const { spawn, execSync, execFileSync } = require('child_process');

function findRunningNextDevInRepo(repoRoot) {
  let output = '';
  try {
    output = execSync('ps -ax -o pid=,command=', { encoding: 'utf8' });
  } catch {
    return [];
  }

  const marker = `${repoRoot}/node_modules/.bin/next dev`;
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes(marker))
    .map((line) => {
      const idx = line.indexOf(' ');
      return {
        pid: idx === -1 ? line : line.slice(0, idx),
        command: idx === -1 ? '' : line.slice(idx + 1)
      };
    });
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
  const legacyAliases = ['journal-section 4.tsx', 'journal-section 5.tsx'].map((name) => path.join(journalDir, name));

  if (fs.existsSync(journalPath)) return;

  const existingAlias = legacyAliases.find((candidate) => fs.existsSync(candidate));
  if (existingAlias) {
    fs.renameSync(existingAlias, journalPath);
    console.warn(`[build-safe] Восстановлен канонический файл: ${path.basename(existingAlias)} -> journal-section.tsx`);
    return;
  }

  console.error('[build-safe] Не найден src/components/journal/journal-section.tsx.');
  console.error('[build-safe] Восстановите канонический файл журнала перед сборкой.');
  process.exit(1);
}

function run() {
  const repoRoot = process.cwd();
  const running = findRunningNextDevInRepo(repoRoot);

  if (running.length > 0) {
    const pids = running.map((item) => item.pid).join(', ');
    console.error(`[build-safe] Обнаружен запущенный next dev для этого репозитория (PID: ${pids}).`);
    console.error('[build-safe] Остановите dev-сервер перед сборкой.');
    process.exit(1);
  }

  runEnvPreflight(repoRoot);
  fs.rmSync(path.join(repoRoot, '.next-build'), { recursive: true, force: true });
  ensureJournalSectionExists(repoRoot);

  const nextBin = path.join(repoRoot, 'node_modules', '.bin', 'next');
  const child = spawn(nextBin, ['build'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_DIST_DIR: '.next-build'
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
