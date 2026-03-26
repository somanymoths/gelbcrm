const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

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

function ensureJournalSectionAlias(repoRoot) {
  const journalDir = path.join(repoRoot, 'src', 'components', 'journal');
  const aliasPath = path.join(journalDir, 'journal-section.tsx');
  const fallbackPath = path.join(journalDir, 'journal-section 4.tsx');

  if (fs.existsSync(aliasPath)) return;

  if (fs.existsSync(fallbackPath)) {
    fs.writeFileSync(aliasPath, "export { JournalSection } from './journal-section 4';\n", 'utf8');
    console.warn('[build-safe] Восстановлен src/components/journal/journal-section.tsx');
    return;
  }

  console.error('[build-safe] Не найден ни journal-section.tsx, ни journal-section 4.tsx.');
  console.error('[build-safe] Восстановите файл журнала перед сборкой.');
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

  fs.rmSync(path.join(repoRoot, '.next-build'), { recursive: true, force: true });
  ensureJournalSectionAlias(repoRoot);

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
