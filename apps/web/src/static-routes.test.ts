import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import { STATIC_ROUTE_PATHS } from "./static-routes.js";

const APP_ROUTE_PATHS = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path !== "/" && path !== "*" && !path.includes(":"));

describe("static route stubs", () => {
  it("covers every static route the shell declares", () => {
    expect([...STATIC_ROUTE_PATHS].sort()).toEqual(APP_ROUTE_PATHS.sort());
  });
});
