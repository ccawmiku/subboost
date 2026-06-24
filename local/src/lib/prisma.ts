import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma";

const globalForPrisma = globalThis as unknown as {
  localPrisma?: PrismaClient;
};

function createPrismaAdapter() {
  const connectionString =
    process.env.DATABASE_URL?.trim() || "postgresql://subboost_local_dev:subboost_local_dev_password@localhost:5432/subboost_local_dev?schema=public";
  return new PrismaPg({ connectionString });
}

export const prisma =
  globalForPrisma.localPrisma ??
  new PrismaClient({
    adapter: createPrismaAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.localPrisma = prisma;
}
