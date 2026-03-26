import type { NextConfig } from 'next';

const distDirFromEnv = process.env.NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(distDirFromEnv ? { distDir: distDirFromEnv } : {})
};

export default nextConfig;
