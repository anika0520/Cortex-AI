/**
 * vite.config.ts — Pure Vite SPA build
 *
 * We deliberately do NOT use @lovable.dev/vite-tanstack-config because it
 * uses the Workers runtime adapter. It is not needed for Vite SPA builds.
 * This config produces a plain static bundle deployable to:
 *   - Vercel (via vercel.json SPA rewrite)
 *   - Netlify (via _redirects)
 *   - Any nginx / CDN
 *   - Docker (nginx.conf already configured)
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [
    // TanStack Router must come before React plugin
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Raise chunk warning limit — our deps are large but fine
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ["react", "react-dom"],
          router:   ["@tanstack/react-router"],
          motion:   ["framer-motion"],
          recharts: ["recharts"],
          radix:    [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-tabs",
          ],
        },
      },
    },
  },
  // Dev server — proxies to local backend so CORS is never an issue locally
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
