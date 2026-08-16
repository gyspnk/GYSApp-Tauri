import { describe, expect, it } from "vitest";
import { featureMessages, messages, translate, type Locale } from "./i18n.js";

const LOCALES: Locale[] = ["id", "en", "zh"];

function allKeys(locale: Locale): Set<string> {
  return new Set([
    ...Object.keys(messages[locale]),
    ...Object.keys(featureMessages[locale]),
  ]);
}

// Keys referenced through ternaries or the navigation table instead of a
// literal translate(locale, "...") call. Kept as a curated list so the
// completeness guard also covers dynamic lookups.
const DYNAMIC_KEYS = [
  "shell.online",
  "shell.offline",
  "nav.home",
  "nav.bible",
  "nav.kidung",
  "nav.iman",
  "nav.more",
  "nav.homeDescription",
  "nav.bibleDescription",
  "nav.kidungDescription",
  "nav.imanDescription",
  "nav.moreDescription",
  "home.sauh",
  "home.today",
  "page.kidungBody",
  "bible.bookmark",
];

// Raw source scan without node types: Vite resolves the module list at build
// time, and the matched keys are exactly the literal translate() calls.
const sources = import.meta.glob("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

const literalKeys = new Set<string>();
for (const [path, text] of Object.entries(sources)) {
  if (path === "./i18n.ts" || path.endsWith(".test.ts")) continue;
  for (const match of text.matchAll(/translate\(locale,\s*["']([^"']+)["']/g)) {
    literalKeys.add(match[1] ?? "");
  }
}

describe("i18n completeness", () => {
  it("keeps the same key set across every locale", () => {
    const reference = allKeys("id");
    expect(reference.size).toBeGreaterThan(0);
    for (const locale of LOCALES.slice(1)) {
      expect(allKeys(locale)).toEqual(reference);
    }
  });

  it("resolves every literal translate() key without falling back", () => {
    expect(literalKeys.size).toBeGreaterThan(0);
    for (const key of literalKeys) {
      for (const locale of LOCALES) {
        const resolved = translate(locale, key);
        expect(
          resolved,
          `${locale} must resolve "${key}" (got the raw key back)`,
        ).not.toBe(key);
      }
    }
  });

  it("resolves every dynamically referenced key in every locale", () => {
    for (const key of DYNAMIC_KEYS) {
      for (const locale of LOCALES) {
        expect(
          translate(locale, key),
          `${locale} must resolve dynamic key "${key}"`,
        ).not.toBe(key);
      }
    }
  });

  it("does not leave unused keys in the tables", () => {
    const expected = new Set([...literalKeys, ...DYNAMIC_KEYS]);
    for (const locale of LOCALES) {
      const extra = [...allKeys(locale)].filter((key) => !expected.has(key));
      expect(extra, `${locale} has keys no component uses`).toEqual([]);
    }
  });
});
