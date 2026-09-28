import { generateSubscriptionYaml, type GeneratedSubscriptionYaml } from "./subscription-service";

export async function getSubscriptionYamlForDelivery(token: string): Promise<GeneratedSubscriptionYaml | "pending" | null> {
  return generateSubscriptionYaml(token);
}
