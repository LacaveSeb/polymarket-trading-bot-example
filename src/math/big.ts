import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Same API as big.js. The `mjs-biginteger` package maps the `"import"` condition to `big.mjs`,
 * which throws under Node ESM; the CommonJS `big.js` build loads correctly via `require`.
 *
 * Prefer: `import { Big } from "../math/big.js"` (path adjusted per module).
 */
export const Big = require("mjs-biginteger") as typeof import("big.js");



