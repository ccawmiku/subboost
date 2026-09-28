import { env } from "cloudflare:workers";
import { createResetSubscriptionAutoUpdateState } from "@subboost/server-core/subscription";
import { prisma } from "./prisma";

type Statement = { bind(...values: unknown[]): Statement };
type Database = {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<Array<{ meta: { changes: number } }>>;
};
const db = (env as unknown as { DB: Database }).DB;

function column(name: string): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error("Invalid database column");
  return `"${name}"`;
}

function encode(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return Number(value);
  return value;
}

function updateStatement(data: Record<string, unknown>, id: string, expectedUpdatedAt?: Date): Statement {
  const fields = Object.keys(data);
  if (fields.length === 0) throw new Error("Empty subscription update");
  const where = expectedUpdatedAt === undefined ? `"id" = ?` : `"id" = ? AND "updatedAt" = ?`;
  const bindings = [...fields.map((field) => encode(data[field])), id];
  if (expectedUpdatedAt) bindings.push(expectedUpdatedAt.toISOString());
  return db.prepare(`UPDATE "Subscription" SET ${fields.map((field) => `${column(field)} = ?`).join(", ")} WHERE ${where}`)
    .bind(...bindings);
}

function conditionalStateUpsertStatement(
  subscriptionId: string,
  stateCreate: Record<string, unknown>,
  stateUpdate: Record<string, unknown>
): Statement {
  const now = new Date().toISOString();
  const data = { subscriptionId, createdAt: now, ...stateCreate, ...stateUpdate, updatedAt: now };
  const fields = Object.keys(data);
  const updateFields = [...Object.keys(stateUpdate), "updatedAt"];
  const sql = `INSERT INTO "SubscriptionAutoUpdateState" (${fields.map(column).join(", ")}) `
    + `SELECT ${fields.map(() => "?").join(", ")} WHERE changes() = 1 `
    + `ON CONFLICT("subscriptionId") DO UPDATE SET ${updateFields.map((field) => `${column(field)} = excluded.${column(field)}`).join(", ")}`;
  return db.prepare(sql).bind(...fields.map((field) => encode(data[field])));
}

export async function updateSubscriptionWithReset(id: string, data: Record<string, unknown>, resetAutoUpdateState: boolean) {
  const update = updateStatement({ ...data, updatedAt: new Date() }, id);
  if (resetAutoUpdateState) {
    const results = await db.batch([
      update,
      conditionalStateUpsertStatement(id, {}, createResetSubscriptionAutoUpdateState()),
    ]);
    if (results[0].meta.changes !== 1) throw new Error("Row not found");
  } else {
    const results = await db.batch([update]);
    if (results[0].meta.changes !== 1) throw new Error("Row not found");
  }
  const row = await prisma.subscription.findUnique({ where: { id }, include: { autoUpdateState: true } });
  if (!row) throw new Error("Updated row not found");
  return row;
}

export async function compareAndSetSubscriptionWithState(params: {
  subscriptionId: string;
  expectedUpdatedAt: Date;
  subscriptionData: Record<string, unknown>;
  stateCreate: Record<string, unknown>;
  stateUpdate: Record<string, unknown>;
}): Promise<boolean> {
  const results = await db.batch([
    updateStatement(params.subscriptionData, params.subscriptionId, params.expectedUpdatedAt),
    conditionalStateUpsertStatement(params.subscriptionId, params.stateCreate, params.stateUpdate),
  ]);
  return results[0].meta.changes === 1;
}
