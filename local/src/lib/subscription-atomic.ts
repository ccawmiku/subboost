import { prisma } from "./prisma";
import { createResetSubscriptionAutoUpdateState } from "@subboost/server-core/subscription";

export async function updateSubscriptionWithReset(id: string, data: Record<string, unknown>, resetAutoUpdateState: boolean) {
  return prisma.$transaction(async (tx) => {
    if (resetAutoUpdateState) {
      await tx.subscriptionAutoUpdateState.upsert({
        where: { subscriptionId: id },
        create: { subscriptionId: id },
        update: createResetSubscriptionAutoUpdateState(),
      });
    }
    return tx.subscription.update({ where: { id }, data, include: { autoUpdateState: true } });
  });
}

export async function compareAndSetSubscriptionWithState(params: {
  subscriptionId: string;
  expectedUpdatedAt: Date;
  subscriptionData: Record<string, unknown>;
  stateCreate: Record<string, unknown>;
  stateUpdate: Record<string, unknown>;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.subscription.updateMany({
      where: { id: params.subscriptionId, updatedAt: params.expectedUpdatedAt },
      data: params.subscriptionData,
    });
    if (updated.count !== 1) return false;
    await tx.subscriptionAutoUpdateState.upsert({
      where: { subscriptionId: params.subscriptionId },
      create: { subscriptionId: params.subscriptionId, ...params.stateCreate },
      update: params.stateUpdate,
    });
    return true;
  });
}
