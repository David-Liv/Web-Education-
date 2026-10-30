import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import type { PoolClient } from 'pg';

export type Row = Record<string, any>;
export interface Database {
  kind: 'sqlite' | 'postgres';
  prepare(sql: string): {
    all(...values: any[]): Promise<Row[]>;
    get(...values: any[]): Promise<Row | undefined>;
    run(...values: any[]): Promise<{changes: number}>;
  };
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => T | Promise<T>): Promise<T>;
  close(): Promise<void>;
  inTransaction(): boolean;
}

// SQLite uses one connection: an async transaction must exclude other requests
// until commit/rollback, including queries that are not themselves transactions.
export class SqliteDatabase implements Database {
  kind = 'sqlite' as const;
  raw: DatabaseSync;
  private context = new AsyncLocalStorage<boolean>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(path: string) {
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  }
  private async exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn();
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  prepare(sql: string) {
    return {
      all: (...values: any[]) => this.exclusive(() => this.raw.prepare(sql).all(...values) as Row[]),
      get: (...values: any[]) => this.exclusive(() => this.raw.prepare(sql).get(...values) as Row | undefined),
      run: (...values: any[]) => this.exclusive(() => ({changes: Number(this.raw.prepare(sql).run(...values).changes)})),
    };
  }
  async exec(sql: string) { await this.exclusive(() => this.raw.exec(sql)); }
  inTransaction() { return !!this.context.getStore(); }
  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.inTransaction()) return fn();
    return this.exclusive(() => this.context.run(true, async () => {
      this.raw.exec('BEGIN IMMEDIATE');
      try { const result = await fn(); this.raw.exec('COMMIT'); return result; }
      catch (error) { this.raw.exec('ROLLBACK'); throw error; }
    }));
  }
  async close() { await this.exclusive(() => this.raw.close()); }
}

export class PostgresDatabase implements Database {
  kind = 'postgres' as const;
  private pool: Pool;
  private context = new AsyncLocalStorage<PoolClient>();
  constructor(connectionString: string) {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL 必須是 PostgreSQL 連線。');
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    const ca = process.env.HOKSE_DATABASE_CA?.replace(/\\n/g, '\n') ??
      (url.hostname.endsWith('.pooler.supabase.com') ? readFileSync(new URL('./certs/supabase-prod-ca-2021.crt',import.meta.url),'utf8') : undefined);
    // Always verify cloud TLS; never silently accept an invalid certificate.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    this.pool = new Pool({connectionString: url.toString(), max: 4,
      connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
      statement_timeout: 15000, idle_in_transaction_session_timeout: 20000,
      options: '-c search_path=hokse,pg_catalog',
      ssl: local ? false : {rejectUnauthorized: true, ...(ca ? {ca} : {})},
    });
    // Do not print the connection error, which can contain server details.
    this.pool.on('error', () => console.error('Cloud database idle connection lost; next request will reconnect.'));
  }
  private query(sql: string, values: any[] = []) {
    let index = 0;
    const text = sql.replace(/\?/g, () => '$' + ++index);
    return (this.context.getStore() ?? this.pool).query(text, values);
  }
  prepare(sql: string) {
    return {
      all: async (...values: any[]) => (await this.query(sql, values)).rows as Row[],
      get: async (...values: any[]) => (await this.query(sql, values)).rows[0] as Row | undefined,
      run: async (...values: any[]) => ({changes: (await this.query(sql, values)).rowCount ?? 0}),
    };
  }
  async exec(sql: string) { await this.query(sql); }
  inTransaction() { return !!this.context.getStore(); }
  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.inTransaction()) return fn();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.context.run(client, fn);
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}
