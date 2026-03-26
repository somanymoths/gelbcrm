import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname
});

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'eslint.config.mjs',
      'next-env.d.ts',
      '.next/**',
      '.next-build/**',
      '.next-dev/**',
      'scripts/**/*.cjs'
    ]
  }
];

export default config;
