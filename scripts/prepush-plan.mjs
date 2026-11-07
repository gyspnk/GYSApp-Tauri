/**
 * The pre-push gate stays cheap on purpose.
 *
 * Owner policy (7 Nov): every development process runs in GitHub Actions; this
 * device only serves the site. A push therefore checks formatting for the files
 * it touches and the documentation/generator map, then hands the real
 * verification to Actions and prints what that run will cover.
 */
export function createPrepushPlan() {
  return [
    { command: "node", args: ["scripts/format-changed.mjs"] },
    { command: "pnpm", args: ["verify:docs"] },
    { command: "node", args: ["scripts/remote-verify.mjs"] },
  ];
}
