import { createElement, Suspense } from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { preloadable } from "./preloadable.js";

it("a warmed page renders content directly and shares one component import", async () => {
  const load = vi.fn(async () => ({
    default: ({ label }: { label: string }) => createElement("p", null, label),
  }));
  const Page = preloadable(load);
  await Promise.all([Page.preload(), Page.preload()]);
  const html = renderToString(
    createElement(
      Suspense,
      { fallback: "waiting" },
      createElement(Page, { label: "Ready" }),
    ),
  );
  expect(html).toContain("<p>Ready</p>");
  expect(html).not.toContain("waiting");
  expect(load).toHaveBeenCalledOnce();
});

it("a failed speculative import can be retried before opening the page", async () => {
  const load = vi
    .fn<() => Promise<{ default: () => ReturnType<typeof createElement> }>>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({
      default: () => createElement("p", null, "Recovered"),
    });
  const Page = preloadable(load);
  await expect(Page.preload()).rejects.toThrow("offline");
  await Page.preload();
  expect(renderToString(createElement(Page))).toContain("Recovered");
  expect(load).toHaveBeenCalledTimes(2);
});
