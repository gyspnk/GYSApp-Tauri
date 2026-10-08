import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configureAndroid } from "./configure-android-preview.mjs";

test("fresh Android generation installs the shell and preserves build rules on repeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "gys-android-"));
  try {
    const activity = join(
      root,
      "app/src/main/java/id/or/gys/app/MainActivity.kt",
    );
    await mkdir(join(root, "app/src/main/java/id/or/gys/app"), {
      recursive: true,
    });
    await writeFile(
      join(root, "app/build.gradle.kts"),
      "// generated configuration\n",
    );
    await writeFile(
      join(root, "app/proguard-tauri.pro"),
      "// original plugin rules\n",
    );
    await writeFile(activity, "// unconfigured shell\n");
    await configureAndroid(root);
    const configured = await readFile(
      join(root, "app/build.gradle.kts"),
      "utf8",
    );
    assert.match(configured, /isMinifyEnabled = true/);
    assert.match(configured, /jniLibs.useLegacyPackaging = true/);
    assert.equal(
      await readFile(activity, "utf8"),
      await readFile(
        new URL("../apps/native/android/MainActivity.kt", import.meta.url),
        "utf8",
      ),
    );
    assert.match(
      await readFile(join(root, "app/gysapp.pro"), "utf8"),
      /native <methods>/,
    );
    await configureAndroid(root);
    assert.equal(
      await readFile(join(root, "app/build.gradle.kts"), "utf8"),
      configured,
    );
    assert.equal(
      await readFile(join(root, "app/proguard-tauri.pro"), "utf8"),
      "// original plugin rules\n",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
