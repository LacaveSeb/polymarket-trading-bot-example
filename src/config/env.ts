/**
 * Environment helpers. Entry scripts should run `import "dotenv/config"` first.
 * All env vars from .env.example are required (no optional env).
 */

/** Get required env var or throw. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

/** Get required integer from env or throw. */
export function requireEnvInt(name: string): number {
  const v = requireEnv(name);
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid env ${name}: expected integer, got "${v}"`);
  }
  return n;
}

/** Get required boolean from env ("true" | "false") or throw. */
export function requireEnvBool(name: string): boolean {
  const v = requireEnv(name);
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`Invalid env ${name}: expected "true" or "false", got "${v}"`);
}
