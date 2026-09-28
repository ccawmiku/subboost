import { enqueueSubscriptionYaml } from "./yaml-delivery";

export async function scheduleSubscriptionYaml(token: string): Promise<void> {
  try {
    await enqueueSubscriptionYaml(token);
  } catch (error) {
    // The first YAML request can retry scheduling if Queue is temporarily unavailable.
    console.error("Unable to schedule subscription YAML", error);
  }
}
