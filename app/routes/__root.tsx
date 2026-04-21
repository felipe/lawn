import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ConvexClientProvider } from "@/lib/convex";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/ThemeToggle";
import { NotFound } from "@/components/ui/NotFound";
import appCss from "../app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "lawn — video review for creative teams" },
      {
        name: "description",
        content:
          "Video review and collaboration for creative teams. Frame-accurate comments, unlimited seats, $5/month flat. The open source Frame.io alternative.",
      },
      { property: "og:site_name", content: "lawn" },
      { name: "twitter:site", content: "@theo" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/grass-logo.svg?v=4" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico?v=4" },
      { rel: "shortcut icon", href: "/favicon.ico?v=4" },
    ],
  }),
  component: RootComponent,
  errorComponent: ({ error }) => {
    return (
      <main className="pt-16 p-4 container mx-auto">
        <h1>Error</h1>
        <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
        {import.meta.env.DEV && error instanceof Error && error.stack ? (
          <pre className="w-full p-4 overflow-x-auto">
            <code>{error.stack}</code>
          </pre>
        ) : null}
      </main>
    );
  },
  notFoundComponent: () => <NotFound />,
});

function RootComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return <RootDocument>{children}</RootDocument>;
}

function RootDocument({ children }: { children: ReactNode }) {
  // crypto.randomUUID polyfill: the real method is secure-context only
  // (https:// or localhost). Lawn runs on http://lawn.ww inside a tailnet
  // so we need a fallback built on crypto.getRandomValues, which works
  // on plain http. Must run before any app code reads crypto.randomUUID.
  const polyfillScript = `
    (() => {
      if (typeof window === "undefined" || !window.crypto || window.crypto.randomUUID) return;
      window.crypto.randomUUID = function() {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
        return hex.slice(0,8) + "-" + hex.slice(8,12) + "-" + hex.slice(12,16) + "-" + hex.slice(16,20) + "-" + hex.slice(20);
      };
    })();
  `;

  const themeInitScript = `
    (() => {
      try {
        const stored = localStorage.getItem("lawn-theme");
        if (stored === "light" || stored === "dark") {
          document.documentElement.setAttribute("data-theme", stored);
          return;
        }
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) {
          document.documentElement.setAttribute("data-theme", "dark");
        }
      } catch {}
    })();
  `;

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="h-full antialiased" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: polyfillScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ConvexClientProvider>
          <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </ConvexClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
