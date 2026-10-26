import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser tests can coexist with an already-running developer server.
  distDir: process.env.STEADY_E2E === "1" ? ".next-e2e" : ".next",
  typescript: { tsconfigPath: process.env.STEADY_E2E === "1" ? "tsconfig.e2e.json" : "tsconfig.json" },
  cacheComponents: true,
  partialPrefetching: true,
  // The installed Tailwind loader implements the Webpack loader API too.
  // Extend Next's existing CSS chains, retaining its extraction and font support.
  webpack(config) {
    const addTailwind = (rules: unknown[]) => {
      for (const entry of rules) {
        if (!entry || typeof entry !== "object") continue;
        const rule = entry as { oneOf?: unknown[]; rules?: unknown[]; use?: unknown[] };
        if (rule.oneOf) addTailwind(rule.oneOf);
        if (rule.rules) addTailwind(rule.rules);
        if (Array.isArray(rule.use) && rule.use.some(loader => loader && typeof loader === "object"
          && "loader" in loader && typeof loader.loader === "string" && loader.loader.includes("/postcss-loader/"))) {
          rule.use.push({ loader: "@tailwindcss/turbopack" });
        }
      }
    };
    addTailwind(config.module.rules);
    return config;
  },
  turbopack: {
    ...(process.env.STEADY_TURBOPACK_ROOT ? { root: process.env.STEADY_TURBOPACK_ROOT } : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
