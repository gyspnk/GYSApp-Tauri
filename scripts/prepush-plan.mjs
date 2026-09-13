export function createPrepushPlan() {
  return [
    { command: "node", args: ["scripts/sync-egys.mjs", "--strict"] },
    {
      command: "node",
      args: ["scripts/check-egys-upstream.mjs", "--strict"],
    },
    { command: "pnpm", args: ["format:check"] },
    { command: "pnpm", args: ["verify:docs"] },
    { command: "pnpm", args: ["verify:generated"] },
    { command: "pnpm", args: ["audit:chords:check"] },
    { command: "pnpm", args: ["native:check"] },
    { command: "pnpm", args: ["test"] },
    { command: "pnpm", args: ["build"] },
    { command: "pnpm", args: ["verify:native-assets"] },
    { command: "pnpm", args: ["verify:bundle"] },
    {
      command: "pnpm",
      args: ["--filter", "@gys/web", "test:e2e"],
      env: { GYS_E2E_PREBUILT: "1" },
    },
  ];
}
