import { getCurrentAdmin, isSetupRequired } from "@local/lib/auth";
import { json } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { MAX_NODES_PER_SUBSCRIPTION } from "@local/lib/subscription-service";
import { authModeFields } from "@local/lib/auth-mode";

export async function GET() {
  const [setupRequired, admin, mode] = await Promise.all([isSetupRequired(), getCurrentAdmin(), authModeFields()]);
  const [subscriptionCount, templateCount] = admin
    ? await Promise.all([
        prisma.subscription.count({ where: { ownerId: admin.id } }),
        prisma.localTemplate.count({ where: { ownerId: admin.id } }),
      ])
    : [0, 0];
  const now = new Date().toISOString();
  return json({
    ...mode,
    setupRequired,
    authenticated: Boolean(admin),
    user: admin
      ? {
          id: admin.id,
          username: admin.username,
          name: admin.username,
          avatarUrl: null,
          trustLevel: 4,
          aiAssistantEnabled: false,
          isAdmin: false,
          isBanned: false,
          active: true,
          silenced: false,
          saveRequirementSatisfied: true,
          saveRequirementSatisfiedAt: now,
          createdAt: now,
          updatedAt: now,
          accounts: [],
          quota: {
            maxSubscriptions: mode.singleAdminLogin ? 20 : 9999,
            maxNodesPerSubscription: MAX_NODES_PER_SUBSCRIPTION,
            maxCustomTemplates: 9999,
            maxImportSourcesPerType: mode.singleAdminLogin ? 10 : 9999,
            canUseSubscriptionLink: true,
          },
          subscriptionCount,
          templateCount,
        }
      : null,
  });
}
