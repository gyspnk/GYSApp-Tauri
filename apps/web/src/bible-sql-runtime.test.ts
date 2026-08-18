import { describe, expect, it } from "vitest";
import { resolveSqlWasmUrl } from "./bible-sql-runtime.js";

describe("SQLite WASM resolver", () => {
  it("keeps POSIX paths absolute after stripping the Vite /@fs prefix", () => {
    expect(
      resolveSqlWasmUrl(
        "/@fs/home/runner/work/GYSApp-Tauri/node_modules/sql.js/dist/sql-wasm.wasm",
        "test",
      ),
    ).toBe(
      "/home/runner/work/GYSApp-Tauri/node_modules/sql.js/dist/sql-wasm.wasm",
    );
  });

  it("keeps Windows drive paths valid after stripping the Vite /@fs prefix", () => {
    expect(
      resolveSqlWasmUrl(
        "/@fs/C:/repo/node_modules/sql.js/dist/sql-wasm.wasm",
        "test",
      ),
    ).toBe("C:/repo/node_modules/sql.js/dist/sql-wasm.wasm");
  });

  it("leaves production asset URLs unchanged", () => {
    expect(resolveSqlWasmUrl("/assets/sql-wasm.wasm", "production")).toBe(
      "/assets/sql-wasm.wasm",
    );
  });
});
