/**
 * main.tsx — SPA client entry point
 *
 * Mounts the TanStack Router app into #root.
 * This file replaces the @tanstack/react-start SSR entry which is only
 * needed for Cloudflare Workers / SSR deployments.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found in index.html");

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
