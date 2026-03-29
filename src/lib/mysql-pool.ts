import mysql from 'mysql2/promise';
import { getMysqlConfig } from '@/lib/env';

const globalForMysqlPool = globalThis as unknown as { mysqlPool?: mysql.Pool };
const STRICT_MODE_GUARD_SQL = `
  SET SESSION sql_mode = IF(
    FIND_IN_SET('STRICT_TRANS_TABLES', @@sql_mode),
    @@sql_mode,
    CONCAT_WS(',', @@sql_mode, 'STRICT_TRANS_TABLES')
  )
`;

export function getMysqlPool(): mysql.Pool {
  if (!globalForMysqlPool.mysqlPool) {
    const config = getMysqlConfig();

    const pool = mysql.createPool({
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

    pool.on('connection', (connection) => {
      connection.query(STRICT_MODE_GUARD_SQL);
    });

    globalForMysqlPool.mysqlPool = pool;
  }

  return globalForMysqlPool.mysqlPool;
}
