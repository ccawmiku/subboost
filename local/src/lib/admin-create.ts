import { prisma } from "./prisma";

export async function createInitialAdmin(username: string, passwordHash: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${1_397_704_283}) IS NULL AS "locked"`;
    if (await transaction.localAdmin.count()) return null;
    return transaction.localAdmin.create({
      data: { username, passwordHash, lastLoginAt: new Date() },
      select: { id: true, username: true },
    });
  });
}
