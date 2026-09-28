import { env } from "cloudflare:workers";
import type { PrismaClient } from "../src/generated/prisma";

type Row = Record<string, unknown>;
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
};
type D1Database = { prepare(sql: string): D1Statement };
type ModelName = "LocalAdmin" | "LocalTemplate" | "Subscription" | "SubscriptionAutoUpdateState" | "JobLeaseLock" | "RevokedSession";

const db = (env as unknown as { DB: D1Database }).DB;
const dates = new Set([
  "createdAt", "updatedAt", "lastLoginAt", "cacheExpiresAt", "lastAccessedAt", "lastUpdatedAt",
  "lastFailedAt", "lastAttemptedAt", "lastNodeQuotaExceededAt", "disabledAt", "expiresAt",
]);
const booleans = new Set(["isPrimary", "allowUnsafeSubscriptionSources"]);
const keys: Record<ModelName, string> = {
  LocalAdmin: "id",
  LocalTemplate: "id",
  Subscription: "id",
  SubscriptionAutoUpdateState: "subscriptionId",
  JobLeaseLock: "name",
  RevokedSession: "revocationKey",
};

function identifier(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error("Invalid database identifier");
  return `"${value}"`;
}

function encode(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return Number(value);
  return value;
}

function decode(row: Row | null): Row | null {
  if (!row) return null;
  const result: Row = { ...row };
  for (const [key, value] of Object.entries(result)) {
    if (value === null || value === undefined) continue;
    if (dates.has(key)) result[key] = new Date(String(value));
    else if (booleans.has(key)) result[key] = Boolean(value);
  }
  return result;
}

function whereClause(where: Row = {}): { sql: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  for (const [field, condition] of Object.entries(where)) {
    const column = identifier(field);
    if (condition === null) {
      clauses.push(`${column} IS NULL`);
    } else if (condition && typeof condition === "object" && !(condition instanceof Date) && !Array.isArray(condition)) {
      const expression = condition as Row;
      if ("not" in expression) {
        if (expression.not === null) clauses.push(`${column} IS NOT NULL`);
        else { clauses.push(`${column} <> ?`); values.push(encode(expression.not)); }
      } else if ("in" in expression && Array.isArray(expression.in)) {
        if (expression.in.length === 0) clauses.push("1 = 0");
        else {
          clauses.push(`${column} IN (${expression.in.map(() => "?").join(", ")})`);
          values.push(...expression.in.map(encode));
        }
      } else if ("lte" in expression) {
        clauses.push(`${column} <= ?`);
        values.push(encode(expression.lte));
      } else {
        throw new Error(`Unsupported database filter: ${field}`);
      }
    } else {
      clauses.push(`${column} = ?`);
      values.push(encode(condition));
    }
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "", values };
}

function selected(row: Row | null, select?: Row): Row | null {
  if (!row || !select) return row;
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]]));
}

function model(table: ModelName) {
  const name = identifier(table);
  return {
    async findMany(args: { where?: Row; select?: Row; include?: Row; orderBy?: Row; take?: number } = {}): Promise<Row[]> {
      const filter = whereClause(args.where);
      const order = args.orderBy ? Object.entries(args.orderBy)[0] : undefined;
      const orderSql = order ? ` ORDER BY ${identifier(order[0])} ${order[1] === "desc" ? "DESC" : "ASC"}` : "";
      const takeSql = args.take === undefined ? "" : ` LIMIT ${Math.max(0, Math.floor(args.take))}`;
      const rows = await db.prepare(`SELECT * FROM ${name}${filter.sql}${orderSql}${takeSql}`).bind(...filter.values).all<Row>();
      const decodedRows = rows.results.map((value) => decode(value) as Row);
      if (args.include?.autoUpdateState && decodedRows.length > 0) {
        const states = await model("SubscriptionAutoUpdateState").findMany({
          where: { subscriptionId: { in: decodedRows.map((row) => row.id) } },
        });
        const bySubscription = new Map(states.map((state) => [state.subscriptionId, state]));
        for (const row of decodedRows) row.autoUpdateState = bySubscription.get(row.id) ?? null;
      }
      if (args.include?.owner && decodedRows.length > 0) {
        const ownerRequest = args.include.owner as Row;
        const owners = await model("LocalAdmin").findMany({
          where: { id: { in: Array.from(new Set(decodedRows.map((row) => row.ownerId))) } },
        });
        const byId = new Map(owners.map((owner) => [owner.id, owner]));
        for (const row of decodedRows) row.owner = selected(byId.get(row.ownerId) ?? null, ownerRequest.select);
      }
      return decodedRows.map((row) => selected(row, args.select) as Row);
    },
    async findFirst(args: { where?: Row; select?: Row; include?: Row } = {}): Promise<Row | null> {
      return (await this.findMany({ ...args, take: 1 }))[0] ?? null;
    },
    async findUnique(args: { where: Row; select?: Row; include?: Row }): Promise<Row | null> {
      return this.findFirst(args);
    },
    async count(args: { where?: Row } = {}): Promise<number> {
      const filter = whereClause(args.where);
      const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${name}${filter.sql}`).bind(...filter.values).first<{ count: number }>();
      return Number(row?.count ?? 0);
    },
    async create(args: { data: Row; select?: Row; include?: Row }): Promise<Row> {
      const now = new Date();
      const data: Row = { ...args.data };
      if (!(keys[table] in data)) data[keys[table]] = crypto.randomUUID();
      if (!("createdAt" in data) && table !== "JobLeaseLock") data.createdAt = now;
      if (!("updatedAt" in data) && table !== "RevokedSession") data.updatedAt = now;
      const fields = Object.keys(data);
      await db.prepare(`INSERT INTO ${name} (${fields.map(identifier).join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`)
        .bind(...fields.map((field) => encode(data[field]))).run();
      const result = await this.findUnique({ where: { [keys[table]]: data[keys[table]] }, select: args.select, include: args.include });
      if (!result) throw new Error("Created row not found");
      return result;
    },
    async updateMany(args: { where: Row; data: Row }): Promise<{ count: number }> {
      const data = { ...args.data };
      if (table !== "RevokedSession" && table !== "JobLeaseLock" && !("updatedAt" in data)) data.updatedAt = new Date();
      const fields = Object.keys(data);
      const filter = whereClause(args.where);
      const result = await db.prepare(`UPDATE ${name} SET ${fields.map((field) => `${identifier(field)} = ?`).join(", ")}${filter.sql}`)
        .bind(...fields.map((field) => encode(data[field])), ...filter.values).run();
      return { count: result.meta.changes };
    },
    async update(args: { where: Row; data: Row; select?: Row; include?: Row }): Promise<Row> {
      const updated = await this.updateMany({ where: args.where, data: args.data });
      if (updated.count !== 1) throw new Error("Row not found");
      const result = await this.findUnique({ where: args.where, select: args.select, include: args.include });
      if (!result) throw new Error("Updated row not found");
      return result;
    },
    async deleteMany(args: { where: Row }): Promise<{ count: number }> {
      const filter = whereClause(args.where);
      const result = await db.prepare(`DELETE FROM ${name}${filter.sql}`).bind(...filter.values).run();
      return { count: result.meta.changes };
    },
    async delete(args: { where: Row }): Promise<Row> {
      const row = await this.findUnique({ where: args.where });
      if (!row) throw new Error("Row not found");
      await this.deleteMany({ where: args.where });
      return row;
    },
    async upsert(args: { where: Row; create: Row; update: Row }): Promise<Row> {
      const key = keys[table];
      const now = new Date();
      const create: Row = { ...args.create };
      if (!(key in create)) create[key] = args.where[key];
      if (!("createdAt" in create) && table !== "JobLeaseLock") create.createdAt = now;
      if (!("updatedAt" in create) && table !== "RevokedSession") create.updatedAt = now;
      const fields = Object.keys(create);
      const update: Row = { ...args.update };
      if (table !== "RevokedSession" && !("updatedAt" in update)) update.updatedAt = now;
      const updateFields = Object.keys(update);
      const onConflict = updateFields.length
        ? `DO UPDATE SET ${updateFields.map((field) => `${identifier(field)} = ?`).join(", ")}`
        : "DO NOTHING";
      await db.prepare(`INSERT INTO ${name} (${fields.map(identifier).join(", ")}) VALUES (${fields.map(() => "?").join(", ")}) ON CONFLICT(${identifier(key)}) ${onConflict}`)
        .bind(...fields.map((field) => encode(create[field])), ...updateFields.map((field) => encode(update[field]))).run();
      const result = await this.findUnique({ where: args.where });
      if (!result) throw new Error("Upserted row not found");
      return result;
    },
  };
}

const implementation = {
  localAdmin: model("LocalAdmin"),
  localTemplate: model("LocalTemplate"),
  subscription: model("Subscription"),
  subscriptionAutoUpdateState: model("SubscriptionAutoUpdateState"),
  jobLeaseLock: model("JobLeaseLock"),
  revokedSession: model("RevokedSession"),
  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> {
    const sql = strings.reduce((result, part, index) => result + part + (index < values.length ? "?" : ""), "");
    return (await db.prepare(sql).bind(...values.map(encode)).all<Row>()).results.map((row) => decode(row) as Row);
  },
  async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number> {
    const sql = strings.reduce((result, part, index) => result + part + (index < values.length ? "?" : ""), "");
    return (await db.prepare(sql).bind(...values.map(encode)).run()).meta.changes;
  },
  async $transaction<T>(callback: (tx: typeof implementation) => Promise<T>): Promise<T> {
    void callback;
    throw new Error("Interactive transactions are not supported by D1; use an atomic batch");
  },
};

export const prisma = implementation as unknown as PrismaClient;
