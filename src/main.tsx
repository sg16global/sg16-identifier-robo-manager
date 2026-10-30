import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { configureIdentity, type AppIdentity } from "@/lib/identity";
import { router } from "@/router";
import "@/styles/globals.css";

/**
 * Boot order matters: the Worker injects this deployment's resolved identity
 * into the HTML shell as <script id="app-identity" type="application/json">,
 * and every display string in the app reads from it. Configure first, render
 * second — no fetch, no flash of default branding.
 */
function bootstrapIdentity() {
  try {
    const node = document.getElementById("app-identity");
    if (node?.textContent) configureIdentity(JSON.parse(node.textContent) as Partial<AppIdentity>);
  } catch {
    // Malformed injection — the neutral defaults apply.
  }
}

bootstrapIdentity();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
