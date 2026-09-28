import type { Metadata } from "next";
import "@subboost/ui/styles/globals.css";
import "./personal-light.css";
import { Footer } from "@subboost/ui/components/layout/footer";
import { MobileNav } from "@subboost/ui/components/layout/mobile-nav";
import { ScrollLockStabilizer } from "@subboost/ui/components/layout/scroll-lock-stabilizer";
import { ConfirmDialogHost } from "@subboost/ui/components/ui/confirm-dialog";
import { Toaster } from "@subboost/ui/components/ui/toaster";
import { LocalHeader } from "@local/components/local-header";
import { resolveAppVersionInfo } from "@subboost/server-core/app-version";
import localPackage from "../package.json";
import {
  SUBBOOST_FAVICON_PATH,
  SUBBOOST_ICON_PATH,
  SUBBOOST_KEYWORDS,
  SUBBOOST_PRODUCT_DESCRIPTION,
  SUBBOOST_PRODUCT_TITLE,
  SUBBOOST_SITE_NAME,
} from "@subboost/ui/brand";

export const metadata: Metadata = {
  title: {
    default: SUBBOOST_PRODUCT_TITLE,
    template: `%s | ${SUBBOOST_SITE_NAME}`,
  },
  description: SUBBOOST_PRODUCT_DESCRIPTION,
  keywords: SUBBOOST_KEYWORDS,
  authors: [{ name: SUBBOOST_SITE_NAME }],
  creator: SUBBOOST_SITE_NAME,
  publisher: SUBBOOST_SITE_NAME,
  icons: {
    icon: SUBBOOST_ICON_PATH,
    shortcut: SUBBOOST_FAVICON_PATH,
    apple: SUBBOOST_ICON_PATH,
  },
};

export const viewport = {
  themeColor: "#fff8fb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { buildVersion } = resolveAppVersionInfo({
    env: process.env,
    cwd: process.cwd(),
    fallbackReleaseVersion: localPackage.version,
  });
  const configuredSourceUrl = process.env.NEXT_PUBLIC_SOURCE_REPOSITORY_URL?.trim();
  const sourceUrl = configuredSourceUrl?.startsWith("https://")
    ? configuredSourceUrl
    : "https://github.com/ccawmiku/subboost-cf-personal";

  return (
    <html lang="zh-CN" className="personal-light">
      <body className="font-sans">
        <ScrollLockStabilizer />
        <div className="min-h-screen bg-gradient-radial flex flex-col">
          <LocalHeader />
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <div className="md:hidden px-4 py-5 text-center text-xs text-white/60">
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
              本版本源码与许可证 (AGPL-3.0)
            </a>
          </div>
          <Footer mode="local" buildVersion={buildVersion} sourceRepositoryUrl={sourceUrl} />
          <MobileNav mode="local" />
        </div>
        <Toaster />
        <ConfirmDialogHost />
      </body>
    </html>
  );
}
