import { env } from "cloudflare:workers";

/**
 * A plain-text setting: a "vars" entry in wrangler.jsonc or a secret
 * (`wrangler secret put NAME`; .dev.vars locally). undefined when unset.
 * Worker code only — the browser bundle never imports this module.
 */
export function setting(name: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

/** Boolean setting with a fallback: "1/true/yes/on" enable, "0/false/no/off" disable. */
export function envFlag(name: string, fallback: boolean): boolean {
  const raw = setting(name)?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

/** Numeric setting with a fallback; ignores values that are not finite numbers. */
export function numSetting(name: string, fallback: number): number {
  const n = Number(setting(name));
  return Number.isFinite(n) ? n : fallback;
}
