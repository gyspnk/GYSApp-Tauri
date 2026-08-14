import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "inherit",
  });
  console.log("Installed repository-managed hooks at .githooks.");
} catch {
  // Package installation is also used by source archives and CI checkouts
  // where a .git directory may not be available. Hooks remain opt-in there.
}
