import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "node:path";

const nodePrismaPath = path.resolve(import.meta.dirname, "src/lib/prisma").replaceAll("\\", "/");
const d1PrismaPath = path.resolve(import.meta.dirname, "cloudflare/prisma.ts");
const localLibPath = path.resolve(import.meta.dirname, "src/lib").replaceAll("\\", "/");

export default defineConfig({
  plugins: [
    {
      name: "subboost-d1-storage",
      enforce: "pre",
      resolveId(id, importer) {
        const fromLocalLib = importer?.replaceAll("\\", "/").includes("/local/src/lib/");
        const normalizedId = id.replaceAll("\\", "/");
        if (id === "@local/lib/prisma" || normalizedId === nodePrismaPath || normalizedId === `${nodePrismaPath}.ts` || (id === "./prisma" && fromLocalLib)) {
          return d1PrismaPath;
        }
        for (const moduleName of ["password", "admin-create", "rate-limit", "source-import", "source-import-jobs", "yaml-delivery", "yaml-jobs", "manual-refresh", "subscription-atomic", "login-credentials", "auth-mode", "totp-management", "rule-catalog", "auth"]) {
          if (id === `@local/lib/${moduleName}` || normalizedId === `${localLibPath}/${moduleName}` || normalizedId === `${localLibPath}/${moduleName}.ts` || (id === `./${moduleName}` && fromLocalLib)) {
            return path.resolve(import.meta.dirname, `cloudflare/${moduleName}.ts`);
          }
        }
      },
    },
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
