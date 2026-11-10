/**
 * Register the `./x.js` → `./x.ts` resolver, so Node can run the repo's
 * TypeScript directly even though the bundler-facing imports say `.js`.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs ...
 */
import { register } from "node:module";

register(new URL("./ts-resolve-hooks.mjs", import.meta.url));
