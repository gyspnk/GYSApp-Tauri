import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const file = "docs/discovery/egys-upstream.json";
const { stdout } = await exec("git", [
  "ls-remote",
  "https://github.com/Gereja-Yesus-Sejati/egys.git",
  "HEAD",
]);
const current = stdout.trim().split(/\s+/)[0];
if (!/^[a-f0-9]{40}$/i.test(current))
  throw new Error("Unable to resolve e-GYS HEAD");
const locked = JSON.parse(await readFile(file, "utf8"));
console.log(`e-GYS locked=${locked.sourceCommit} current=${current}`);
if (process.argv.includes("--write") && locked.sourceCommit !== current) {
  locked.sourceCommit = current;
  locked.checkedAt = new Date().toISOString();
  await writeFile(file, `${JSON.stringify(locked, null, 2)}\n`);
  console.log("Updated e-GYS provenance lock.");
}
if (!process.argv.includes("--write") && locked.sourceCommit !== current)
  process.exitCode = 1;
