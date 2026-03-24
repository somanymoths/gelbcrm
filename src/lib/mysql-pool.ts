import mysql from 'mysql2/promise';
import { getMysqlConfig } from '@/lib/env';

const globalForMysqlPool = globalThis as unknown as { mysqlPool?: mysql.Pool };

export function getMysqlPool(): mysql.Pool {
  if (!globalForMysqlPool.mysqlPool) {
    const config = getMysqlConfig();

    globalForMysqlPool.mysqlPool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
      maxIdle: 10,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 15_000,
      charset: 'utf8mb4'
    });
  }

  return globalForMysqlPool.mysqlPool;
}
