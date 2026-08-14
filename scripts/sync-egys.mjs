import { createHash } from "node:crypto";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(".");
const repo = "Gereja-Yesus-Sejati/egys";
const lockPath = "docs/discovery/egys-upstream.json";
const contractPath = "docs/discovery/egys-api-contract.json";
const generatedPath = "apps/bff/src/egys-contract.ts";
const strict = process.argv.includes("--strict");
const write = process.argv.includes("--write");
const token = process.env.EGYS_UPSTREAM_TOKEN?.trim();
const upstreamUrl = token
  ? `https://x-access-token:${token}@github.com/${repo}.git`
  : `https://github.com/${repo}.git`;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function git(args, cwd = root) {
  const result = await exec("git", args, { cwd, maxBuffer: 4 * 1024 * 1024 });
  return result.stdout.trim();
}

async function remoteHead() {
  return (await git(["ls-remote", upstreamUrl, "HEAD"])).split(/\s+/)[0];
}

async function localCheckout(current) {
  const candidates = [];
  if (process.env.EGYS_LOCAL_CHECKOUT?.trim())
    candidates.push(resolve(process.env.EGYS_LOCAL_CHECKOUT.trim()));
  if (await exists(join(root, ".tmp-egys-cdfc3d1")))
    candidates.push(join(root, ".tmp-egys-cdfc3d1"));
  const entries = await readdir(root, { withFileTypes: true });
  candidates.push(
    ...entries
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith(".tmp-egys-"),
      )
      .map((entry) => join(root, entry.name)),
  );
  const unique = [...new Set(candidates)];
  for (const candidate of unique) {
    let remote;
    try {
      remote = await git(["remote", "get-url", "origin"], candidate);
    } catch {
      // Ignore unrelated temporary directories.
      continue;
    }
    if (!remote.includes(repo)) continue;
    try {
      // A matching checked-in SHA is not proof that this shallow checkout
      // has actually fetched the latest remote state. Always refresh it so
      // every pre-commit inspects the immutable upstream tip, even after an
      // interrupted fetch or a moved remote ref.
      await git(["fetch", "--depth=1", "origin", "HEAD"], candidate);
      const head = await git(["rev-parse", "FETCH_HEAD"], candidate);
      if (head !== current)
        throw new Error(
          `e-GYS HEAD changed during synchronization (${head} !== ${current})`,
        );
      await git(["fetch", "--depth=1", "origin", current], candidate);
      await git(["checkout", "--force", current], candidate);
      return candidate;
    } catch (error) {
      if (strict) throw error;
      console.warn(`Unable to refresh e-GYS checkout ${candidate}; skipping.`);
    }
  }
  const destination = join(root, `.tmp-egys-${current.slice(0, 7)}`);
  await exec(
    "git",
    ["clone", "--filter=blob:none", "--no-checkout", upstreamUrl, destination],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  await git(["checkout", "--force", current], destination);
  return destination;
}

async function sourceFiles(directory) {
  const result = [];
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && entry.name.endsWith(".java"))
        result.push(child);
    }
  }
  await visit(directory);
  return result;
}

function normalizePath(base, child) {
  const left = base.endsWith("/") ? base.slice(0, -1) : base;
  const right =
    !child || child === "/" ? "" : child.startsWith("/") ? child : `/${child}`;
  return `${left}${right}`.replace(/\/+/g, "/");
}

function mappingPath(argumentsText) {
  if (!argumentsText) return "/";
  const value = argumentsText.match(/(?:path\s*=\s*)?"([^"]*)"/);
  return value?.[1] ?? "/";
}

async function extractContract(checkout, sourceCommit) {
  const javaRoot = join(checkout, "backend", "src", "main", "java");
  const files = await sourceFiles(javaRoot);
  const securityPath = join(
    checkout,
    "backend",
    "src",
    "main",
    "java",
    "id",
    "gys",
    "egys",
    "config",
    "SecurityConfig.java",
  );
  const security = (await exists(securityPath))
    ? await readFile(securityPath, "utf8")
    : "";
  const publicPaths = [
    ...security.matchAll(/requestMatchers\(([^)]*)\)/g),
  ].flatMap((match) =>
    [...match[1].matchAll(/"(\/api\/v1[^"]*)"/g)].map((item) => item[1]),
  );
  const routes = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const classMapping =
      text.match(/@RequestMapping\s*\(\s*"([^"]+)"\s*\)/)?.[1] ?? "";
    if (!classMapping) continue;
    const methods = ["Get", "Post", "Put", "Delete", "Patch"];
    const matcher = new RegExp(
      `@(${methods.join("|")})Mapping(?:\\s*\\(([^)]*)\\))?`,
      "g",
    );
    for (const match of text.matchAll(matcher)) {
      const method = match[1].toUpperCase();
      const path = normalizePath(classMapping, mappingPath(match[2]));
      const authentication =
        publicPaths.some((value) => value === path) ||
        path === "/api/v1/auth/{provider}"
          ? "public"
          : "session";
      routes.push({
        method,
        path,
        authentication,
        source: relative(checkout, file).replaceAll("\\", "/"),
      });
    }
  }
  const unique = [
    ...new Map(
      routes.map((route) => [`${route.method} ${route.path}`, route]),
    ).values(),
  ];
  unique.sort((left, right) =>
    `${left.path} ${left.method}`.localeCompare(
      `${right.path} ${right.method}`,
    ),
  );
  const authController = join(
    checkout,
    "backend",
    "src",
    "main",
    "java",
    "id",
    "gys",
    "egys",
    "auth",
    "web",
    "AuthController.java",
  );
  const authSource = (await exists(authController))
    ? await readFile(authController, "utf8")
    : "";
  const callbackRoutes = [
    ...authSource.matchAll(
      /@(Get|Post)Mapping\s*\(\s*"([^"]*callback[^"]*)"/gi,
    ),
  ].map((match) => `/api/v1/auth${match[2]}`);
  const auth = {
    mode: authSource.includes("SignInRequest")
      ? "provider-id-token-exchange"
      : "unknown",
    providersPath: "/api/v1/auth/providers",
    signInPath: "/api/v1/auth/{provider}",
    requestBody: authSource.includes("record SignInRequest") ? ["idToken"] : [],
    sessionCookie: authSource.includes("HttpOnly") ? "HttpOnly" : "unknown",
    callbackRoutes,
  };
  return {
    sourceRepo: repo,
    sourceCommit,
    generatedAt: new Date().toISOString(),
    auth,
    routes: unique,
  };
}

function stableContract(contract) {
  return {
    sourceRepo: contract.sourceRepo,
    sourceCommit: contract.sourceCommit,
    auth: contract.auth,
    routes: contract.routes,
  };
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compare(previous, current) {
  if (!previous?.routes?.length)
    return { breaking: [], compatible: current.routes };
  const currentKeys = new Set(
    current.routes.map((route) => `${route.method} ${route.path}`),
  );
  const breaking = previous.routes.filter(
    (route) => !currentKeys.has(`${route.method} ${route.path}`),
  );
  const previousKeys = new Set(
    previous.routes.map((route) => `${route.method} ${route.path}`),
  );
  const compatible = current.routes.filter(
    (route) => !previousKeys.has(`${route.method} ${route.path}`),
  );
  return { breaking, compatible };
}

let current;
try {
  current = await remoteHead();
} catch (error) {
  const message =
    "Unable to access e-GYS upstream locally; configure GitHub credentials or EGYS_UPSTREAM_TOKEN.";
  if (strict) throw new Error(message, { cause: error });
  console.warn(message);
  process.exit(0);
}
if (!/^[a-f0-9]{40}$/i.test(current))
  throw new Error("Unable to resolve e-GYS upstream HEAD");
const lock = JSON.parse(await readFile(lockPath, "utf8"));
if (strict && lock.compatibility === "breaking") {
  throw new Error(
    "The checked-in e-GYS contract is marked breaking; adapt the integration before committing.",
  );
}
const checkout = await localCheckout(current);
const nextContract = await extractContract(checkout, current);
const previousContract = process.argv.includes("--refresh")
  ? undefined
  : (await exists(contractPath))
    ? JSON.parse(await readFile(contractPath, "utf8"))
    : undefined;
const diff = compare(previousContract, nextContract);
const contractHash = hash(stableContract(nextContract));
console.log(
  `e-GYS contract ${previousContract?.sourceCommit ?? "none"} → ${current}`,
);
console.log(`routes=${nextContract.routes.length} hash=${contractHash}`);
if (diff.breaking.length) {
  console.error("Breaking e-GYS API changes detected:");
  for (const route of diff.breaking)
    console.error(`  removed ${route.method} ${route.path}`);
  if (strict) process.exitCode = 2;
}
const generated = (await exists(generatedPath))
  ? await readFile(generatedPath, "utf8")
  : "";
const canReuseGenerated =
  !process.argv.includes("--refresh") &&
  lock.sourceCommit === current &&
  lock.contractHash === contractHash &&
  (await exists(contractPath)) &&
  generated.includes(`"${contractHash}"`);
if (write && canReuseGenerated && !process.exitCode) {
  console.log("e-GYS contract is current; refreshed checkout only.");
  process.exit(0);
}
if (!write || process.exitCode)
  process.exit(process.exitCode ?? (lock.sourceCommit === current ? 0 : 1));

const nextLock = {
  ...lock,
  sourceCommit: current,
  checkedAt: new Date().toISOString(),
  contractHash,
  compatibility: diff.breaking.length ? "breaking" : "compatible",
};
await writeFile(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`);
await writeFile(
  contractPath,
  `${JSON.stringify({ ...nextContract, generatedAt: new Date().toISOString(), contractHash }, null, 2)}\n`,
);
await writeFile(
  generatedPath,
  `/** Generated by scripts/sync-egys.mjs; do not edit by hand. */\nexport const egysContractHash =\n  "${contractHash}" as const;\nexport const egysAuthContract = ${JSON.stringify(nextContract.auth, null, 2)} as const;\nexport const egysApiRoutes = ${JSON.stringify(nextContract.routes, null, 2)} as const;\n`,
);
console.log(
  "Updated e-GYS contract snapshot, lock, and generated route metadata.",
);
