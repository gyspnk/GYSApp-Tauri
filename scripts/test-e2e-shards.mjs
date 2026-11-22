import { execFileSync, spawn } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCommand, isFresh, newestSource } from "./e2e-one.mjs";
import { pnpmInvocation } from "./process-result.mjs";

/**
 * Run the full browser suite as parallel shards against one preview server.
 *
 * A single Playwright process serializes whole files per worker; sharding adds
 * independent processes so the 826-test suite finishes in a fraction of the
 * wall time. The preview server is shared (Playwright reuses it), so start
 * `pnpm preview` first — this script refuses to guess a build.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const option = (name, fallback) => {
  const index = rawArgs.findIndex(
    (arg) => arg === name || arg.startsWith(`${name}=`),
  );
  if (index === -1) return fallback;
  const [flag, inline] = rawArgs[index].split("=");
  if (inline !== undefined) {
    rawArgs.splice(index, 1);
    return inline;
  }
  const value = rawArgs[index + 1];
  rawArgs.splice(index, 2);
  if (value === undefined) throw new Error(`${flag} needs a value`);
  return value;
};

const shards = Number(option("--shards", process.env.GYS_E2E_SHARDS ?? 2));
const workers = Number(option("--workers", process.env.GYS_E2E_WORKERS ?? 2));
if (!Number.isInteger(shards) || shards < 1)
  throw new Error("--shards must be a positive integer");
if (!Number.isInteger(workers) || workers < 1)
  throw new Error("--workers must be a positive integer");

const baseUrl = process.env.GYS_E2E_BASE_URL ?? "http://127.0.0.1:4173";
const appUrl = `${baseUrl.replace(/\/$/, "")}/GYSApp-Tauri/`;

async function isPreviewReachable() {
  try {
    const response = await fetch(appUrl, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensurePreview() {
  if (await isPreviewReachable()) return undefined;
  const distIndex = path.join(webDir, "dist", "index.html");
  let fresh = false;
  try {
    fresh =
      process.env.GYS_E2E_FORCE_BUILD !== "1" &&
      isFresh(statSync(distIndex).mtimeMs, newestSource(webDir));
  } catch {
    fresh = false;
  }
  if (!fresh) {
    console.log("Building @gys/web before starting shared preview server...");
    const build = buildCommand(process.env);
    execFileSync(build.command, build.args, {
      cwd: rootDir,
      stdio: "inherit",
      env: build.env,
    });
  }
  const preview = pnpmInvocation([
    "--filter",
    "@gys/web",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    new URL(appUrl).port || "4173",
    "--strictPort",
  ]);
  const child = spawn(preview.command, preview.args, {
    cwd: rootDir,
    shell: preview.shell,
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isPreviewReachable()) return child;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill("SIGTERM");
  console.error(`Preview server at ${appUrl} did not become ready in time.`);
  process.exit(1);
}

const ownPreview = await ensurePreview();
const outputDir = path.join(webDir, "test-results", "shards");
await mkdir(outputDir, { recursive: true });

const runShard = (index) =>
  new Promise((resolve) => {
    const started = Date.now();
    const invocation = pnpmInvocation([
      "exec",
      "playwright",
      "test",
      "--shard",
      `${index + 1}/${shards}`,
      "--workers",
      String(workers),
      "--fully-parallel",
      "--reporter",
      "line",
      ...rawArgs,
    ]);
    const child = spawn(invocation.command, invocation.args, {
      cwd: webDir,
      env: { ...process.env, GYS_E2E_PREBUILT: "1" },
      shell: invocation.shell,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const logPath = path.join(outputDir, `shard-${index + 1}.log`);
    const chunks = [];
    const collect = (chunk) => {
      chunks.push(chunk);
      process.stdout.write(`[shard ${index + 1}] ${chunk}`);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      collect(`${error.message}\n`);
      resolve({
        index,
        code: 1,
        seconds: (Date.now() - started) / 1000,
        logPath,
        chunks,
      });
    });
    child.on("close", async (code, signal) => {
      const text = Buffer.concat(chunks).toString("utf8");
      await writeFile(logPath, text).catch(() => undefined);
      resolve({
        index,
        code: signal ? 1 : (code ?? 1),
        seconds: (Date.now() - started) / 1000,
        logPath,
        chunks,
      });
    });
  });

const started = Date.now();
console.log(
  `Running ${shards} shard(s) × ${workers} worker(s) against ${appUrl}`,
);
let results;
try {
  results = await Promise.all(
    Array.from({ length: shards }, (_, index) => runShard(index)),
  );
} finally {
  ownPreview?.kill("SIGTERM");
}
const total = (Date.now() - started) / 1000;

for (const result of results.sort((left, right) => left.index - right.index)) {
  const summary = result.chunks
    .map((chunk) => chunk.toString("utf8"))
    .join("")
    .split("\n")
    .filter((line) => /passed|failed|flaky|skipped/.test(line))
    .slice(-2)
    .join(" | ");
  console.log(
    `shard ${result.index + 1}: exit ${result.code} in ${result.seconds.toFixed(1)}s — ${summary || "no summary"}`,
  );
}

const failed = results.filter((result) => result.code !== 0);
console.log(
  `\nTotal wall time: ${total.toFixed(1)}s (${(total / 60).toFixed(1)} min) — ${failed.length ? `${failed.length} shard(s) failed` : "all shards passed"}`,
);
process.exit(failed.length ? 1 : 0);
