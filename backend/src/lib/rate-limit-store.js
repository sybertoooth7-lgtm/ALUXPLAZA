import db from '../db.js';

// Implements express-rate-limit v6+'s async Store interface (increment/
// decrement/resetKey), backed by the `rate_limits` table from migration
// 005. This project already depends on Postgres for everything else, so
// this avoids needing a whole separate Redis deployment just for
// cluster-safe rate limiting — the previous approach (middleware/rate-
// limit.js trying rate-limit-redis/ioredis) required REDIS_URL to be set,
// which it never was, so it silently fell back to an in-memory store that
// isn't shared across CLUSTER_MODE workers anyway.
export class PostgresRateLimitStore {
  constructor() {
    this.windowMs = 15 * 60 * 1000; // overwritten by init()
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const result = await db.query(
      `INSERT INTO rate_limits (key, count, reset_time)
       VALUES ($1, 1, NOW() + INTERVAL '1 millisecond' * $2)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE
           WHEN rate_limits.reset_time <= NOW() THEN 1
           ELSE rate_limits.count + 1
         END,
         reset_time = CASE
           WHEN rate_limits.reset_time <= NOW() THEN NOW() + INTERVAL '1 millisecond' * $2
           ELSE rate_limits.reset_time
         END
       RETURNING count, reset_time`,
      [key, this.windowMs]
    );
    const row = result.rows[0];
    return { totalHits: row.count, resetTime: new Date(row.reset_time) };
  }

  async decrement(key) {
    await db.query('UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1', [key]);
  }

  async resetKey(key) {
    await db.query('DELETE FROM rate_limits WHERE key = $1', [key]);
  }
}
