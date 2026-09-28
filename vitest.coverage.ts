import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

const coverageThresholds = {
  lines: 97,
  statements: 97,
  functions: 97,
  branches: 96,
} as const;

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["test/**/*.test.ts"],
      coverage: {
        provider: "v8",
        include: [
          "packages/**/*.{ts,tsx,js,cjs,mjs}",
          "local/**/*.{ts,tsx,js,cjs,mjs}",
          "scripts/**/*.{ts,tsx,js,cjs,mjs}",
        ],
        exclude: [
          "**/*.{test,spec}.{ts,tsx,js,cjs,mjs}",
          "**/*.test-{helpers,utils}.{ts,tsx,js,cjs,mjs}",
          "**/*.d.ts",
          "**/node_modules/**",
          "**/.next/**",
          "**/.wrangler/**",
          "**/dist/**",
          "**/build/**",
          "**/coverage/**",
          "**/.cache/**",
          "**/.turbo/**",
          "**/fixtures/**",
          "**/__fixtures__/**",
          "**/*.config.{ts,tsx,js,cjs,mjs}",
          "**/eslint.config.{ts,js,mjs}",
          "**/next.config.{ts,js,mjs}",
          "**/postcss.config.{ts,js,mjs}",
          "**/tailwind.config.{ts,js,mjs}",
          "**/generated/prisma/**",
          "**/generated/prisma-d1/**",
          "**/prisma/generated/**",
          // These adapters require Cloudflare bindings and are verified on a deployed Worker.
          "local/cloudflare/**",
          // These operational scripts need live Wrangler resources and are exercised by staging smoke tests.
          "local/scripts/cloudflare-backup.mjs",
          "local/scripts/deploy-cloudflare.mjs",
          "local/scripts/smoke-cloudflare.mjs",
          "local/scripts/test-yaml-fallback.mjs",
        ],
        reporter: ["text", "json-summary", "html", "lcov"],
        reportsDirectory: "coverage",
        thresholds: coverageThresholds,
      },
    },
  }),
);
