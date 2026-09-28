import { prisma } from "./prisma";
import { verifyPassword } from "./password";

export const singleAdminLogin = false;
export const invalidLoginMessage = "Invalid username or password.";

export async function authenticateLogin(username: string, password: string, _totpCode: string) {
  const admin = username
    ? await prisma.localAdmin.findUnique({ where: { username }, select: { id: true, username: true, passwordHash: true } })
    : null;
  return admin && await verifyPassword(password, admin.passwordHash)
    ? { id: admin.id, username: admin.username }
    : null;
}
