import { execFileSync } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function configureAndroid(
  androidRoot = resolve(
    import.meta.dirname,
    "../apps/native/src-tauri/gen/android",
  ),
) {
  const project = resolve(androidRoot, "app/build.gradle.kts");
  const marker = "// GYSApp optimized preview";
  const source = await readFile(project, "utf8");
  const additions = [];
  const messagingMarker = "// GYSApp origin-scoped status accent";
  if (!source.includes(messagingMarker)) {
    additions.push(
      `${messagingMarker}\ndependencies {\n    implementation("androidx.webkit:webkit:1.14.0")\n}\n`,
    );
  }
  if (!source.includes(marker)) {
    // Keep Tauri's generated ProGuard rules and plugin consumer rules intact.
    // The preview signing identity is independent of the optimized Rust profile.
    additions.push(
      `${marker}\nandroid {\n    buildTypes {\n        getByName("release") {\n            isMinifyEnabled = true\n            isShrinkResources = true\n            ndk {\n                debugSymbolLevel = "NONE"\n            }\n            signingConfig = signingConfigs.getByName("debug")\n        }\n    }\n}\n`,
    );
  }
  const compressionMarker = "// GYSApp compact JNI packaging";
  if (!source.includes(compressionMarker)) {
    // Extracted once by Android at installation; runtime library bytes stay intact.
    // Also strip unused AndroidX locale tables and redundant JVM/Kotlin metadata.
    additions.push(
      `${compressionMarker}\nandroid {\n    androidResources {\n        localeFilters += listOf("en", "in", "id", "zh")\n    }\n    packaging {\n        jniLibs.useLegacyPackaging = true\n        resources {\n            excludes += listOf(\n                "META-INF/DEPENDENCIES",\n                "META-INF/LICENSE*",\n                "META-INF/NOTICE*",\n                "META-INF/*.kotlin_module",\n                "META-INF/AL2.0",\n                "META-INF/LGPL2.1",\n                "DebugProbesKt.bin",\n                "kotlin/**",            )\n        }\n    }\n}\n`,
    );
  }
  if (additions.length) {
    await writeFile(project, `${source}\n${additions.join("\n")}`);
  }

  // Generated sources are ignored; install the reviewed shell after every init.
  await copyFile(
    resolve(import.meta.dirname, "../apps/native/android/MainActivity.kt"),
    resolve(androidRoot, "app/src/main/java/id/or/gys/app/MainActivity.kt"),
  );

  await copyFile(
    resolve(import.meta.dirname, "../apps/native/android/gysapp.pro"),
    resolve(androidRoot, "app/gysapp.pro"),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await configureAndroid();
  if (process.env.GITHUB_ACTIONS === "true") {
    const iconPng = resolve(tmpdir(), "gys-dove-icon.png");
    const root = resolve(import.meta.dirname, "..");
    execFileSync(
      process.execPath,
      [resolve(import.meta.dirname, "generate-dove-icon-png.mjs"), iconPng],
      { cwd: root, stdio: "inherit" },
    );
    execFileSync(
      "pnpm",
      ["--filter", "@gys/native", "tauri", "icon", iconPng],
      { cwd: root, stdio: "inherit" },
    );
  }
}
