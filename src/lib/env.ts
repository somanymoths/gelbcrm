import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/constants';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export type MysqlConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export function getMysqlConfig(): MysqlConfig {
  return {
    host: getRequiredEnv('DB_HOST'),
    port: Number(process.env.DB_PORT ?? '3306'),
    database: getRequiredEnv('DB_DATABASE'),
    user: getRequiredEnv('DB_USERNAME'),
    password: getRequiredEnv('DB_PASSWORD')
  };
}

export function getSessionSecret(): string {
  return getRequiredEnv('SESSION_SECRET');
}

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };
