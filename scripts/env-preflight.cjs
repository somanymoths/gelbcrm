#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const REQUIRED_ENV_VARS = ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD', 'SESSION_SECRET'];
const repoRoot = path.join(__dirname, '..');
const envCandidates = ['.env.local', '.env'];

for (const fileName of envCandidates) {
  const filePath = path.join(repoRoot, fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

if (process.env.SKIP_ENV_PREFLIGHT === '1') {
  process.exit(0);
}

const missing = REQUIRED_ENV_VARS.filter((name) => {
  const value = process.env[name];
  return typeof value !== 'string' || value.trim() === '';
});

if (missing.length === 0) {
  process.exit(0);
}

console.error('[env-preflight] Missing required environment variables:');
for (const name of missing) {
  console.error(`- ${name}`);
}
console.error('[env-preflight] Fill .env.local (or export env vars) and retry.');
process.exit(1);
