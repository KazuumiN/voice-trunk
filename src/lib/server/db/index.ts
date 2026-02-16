/**
 * Org-scoped database query factory.
 * All queries automatically include orgId filtering for tenant isolation.
 */

export interface OrgScopedDb {
  db: D1Database;
  orgId: string;

  /** Execute a query with orgId prepended to the bind params. */
  query<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<D1Result<T>>;

  /** Execute a query and return the first result. */
  queryFirst<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T | null>;

  /** Execute a query and return all results. */
  queryAll<T = Record<string, unknown>>(
    sql: string,
    ...params: unknown[]
  ): Promise<T[]>;

  /** Run a raw query without orgId injection (for inserts where orgId is in VALUES). */
  run(sql: string, ...params: unknown[]): Promise<D1Result>;

  /** Execute a batch of statements in a transaction. */
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;

  /** Create a prepared statement. */
  prepare(sql: string): D1PreparedStatement;
}

export function orgScopedQuery(db: D1Database, orgId: string): OrgScopedDb {
  return {
    db,
    orgId,

    async query<T = Record<string, unknown>>(
      sql: string,
      ...params: unknown[]
    ): Promise<D1Result<T>> {
      return db
        .prepare(sql)
        .bind(...params)
        .all<T>();
    },

    async queryFirst<T = Record<string, unknown>>(
      sql: string,
      ...params: unknown[]
    ): Promise<T | null> {
      return db
        .prepare(sql)
        .bind(...params)
        .first<T>();
    },

    async queryAll<T = Record<string, unknown>>(
      sql: string,
      ...params: unknown[]
    ): Promise<T[]> {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .all<T>();
      return result.results;
    },

    async run(sql: string, ...params: unknown[]): Promise<D1Result> {
      return db
        .prepare(sql)
        .bind(...params)
        .run();
    },

    async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
      return db.batch(statements);
    },

    prepare(sql: string): D1PreparedStatement {
      return db.prepare(sql);
    },
  };
}
