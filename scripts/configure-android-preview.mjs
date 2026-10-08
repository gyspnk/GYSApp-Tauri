import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const project = resolve(
  import.meta.dirname,
  "../apps/native/src-tauri/gen/android/app/build.gradle.kts",
);
const marker = "// GYSApp optimized preview";
const source = await readFile(project, "utf8");
const additions = [];
if (!source.includes(marker)) {
  // Keep Tauri's generated ProGuard rules and plugin consumer rules intact.
  // The preview signing identity is independent of the optimized Rust profile.
  additions.push(
    `${marker}\nandroid {\n    buildTypes {\n        getByName("release") {\n            isMinifyEnabled = true\n            isShrinkResources = true\n            signingConfig = signingConfigs.getByName("debug")\n        }\n    }\n}\n`,
  );
}
const compressionMarker = "// GYSApp compact JNI packaging";
if (!source.includes(compressionMarker)) {
  // Extracted once by Android at installation; runtime library bytes stay intact.
  additions.push(
    `${compressionMarker}\nandroid {\n    packaging {\n        jniLibs.useLegacyPackaging = true\n    }\n}\n`,
  );
}
if (additions.length) {
  await writeFile(project, `${source}\n${additions.join("\n")}`);
}
