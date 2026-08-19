import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  HymnCatalogEntrySchema,
  LiteratureCatalogSchema,
  SauhPostSchema,
  SuaraSejatiFeedSchema,
  type LiteratureCatalog,
  type HymnCatalogEntry,
  type SauhPost,
  type SuaraSejatiFeed,
} from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import { recordDiagnostic } from "./diagnostics.js";
import {
  bibleBookNames,
  bibleVerseEntries,
  loadBiblePack,
  type BibleSearchEntry,
} from "./global-bible-search.js";
import { BibleSearchClient } from "./bible-search.js";
import { loadInstalledDistributedHymnCatalog } from "./distributed-hymnals.js";
import { getDistributedAssetManager } from "./distributed-asset-manager.js";

type SearchKind = "hymn" | "literature" | "faith" | "sauh" | "suara" | "bible";
type SearchEntry = {
  id: string;
  kind: SearchKind;
  title: string;
  detail: string;
  searchText: string;
  href?: string;
  external?: boolean;
};

type FaithPack = {
  faith: Array<{
    language: string;
    content: Array<{ number: string; text: string }>;
  }>;
};

let indexPromise: Promise<SearchEntry[]> | undefined;

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Search source failed: ${response.status}`);
  return (await response.json()) as T;
}

function faithEntries(value: unknown): SearchEntry[] {
  if (!value || typeof value !== "object") return [];
  const faith = (value as FaithPack).faith;
  if (!Array.isArray(faith)) return [];
  return faith.flatMap((group) =>
    Array.isArray(group.content)
      ? group.content.map((item) => ({
          id: `${group.language}-${item.number}`,
          kind: "faith" as const,
          title: `Pokok ${item.number}`,
          detail: group.language,
          searchText: `${item.number} ${item.text}`,
          href: `/iman?item=${encodeURIComponent(item.number)}`,
        }))
      : [],
  );
}

function createIndex(
  hymns: HymnCatalogEntry[],
  literature: LiteratureCatalog,
  faith: unknown,
  sauh: SauhPost[],
  suara: SuaraSejatiFeed,
): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const hymn of hymns) {
    entries.push({
      id: hymn.id,
      kind: "hymn",
      title: `${String(hymn.number).padStart(3, "0")} · ${hymn.title}`,
      detail: `Kidung · ${hymn.book}`,
      searchText: `${hymn.number} ${hymn.title} ${hymn.lyrics}`,
      href: `/kidung/${hymn.id}`,
    });
  }
  for (const item of literature.items) {
    entries.push({
      id: item.id,
      kind: "literature",
      title: item.title,
      detail: `Literatur · ${item.category}`,
      searchText: `${item.title} ${item.description} ${item.category}`,
      href: `/literatur/${encodeURIComponent(item.id)}`,
    });
  }
  entries.push(...faithEntries(faith));
  for (const item of sauh) {
    entries.push({
      id: item.id,
      kind: "sauh",
      title: item.title,
      detail: `Sauh Bagi Jiwa${item.reference ? ` · ${item.reference}` : ""}`,
      searchText: `${item.title} ${item.reference ?? ""} ${item.verse ?? ""} ${item.body}`,
      href: "/sauh",
    });
  }
  for (const item of suara.items) {
    entries.push({
      id: item.id,
      kind: "suara",
      title: item.title,
      detail: "Suara Sejati · tjc.org",
      searchText: `${item.title} ${item.excerpt}`,
      href: `/suara/${encodeURIComponent(item.id)}`,
    });
  }
  return entries;
}

async function loadSearchIndex(): Promise<SearchEntry[]> {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim().replace(/\/$/, "");
  const staticBase = import.meta.env.BASE_URL;
  const [hymnResult, literatureResult, faithResult, sauhResult, suaraResult] =
    await Promise.allSettled([
      readJson<{ items: unknown[] }>(`${staticBase}offline/hymn-catalog.json`),
      readJson<LiteratureCatalog>(`${staticBase}offline/literature.json`),
      readJson<FaithPack>(`${staticBase}offline/faith.json`),
      readJson<{ items: unknown[] }>(`${staticBase}offline/sauh.json`),
      readJson<SuaraSejatiFeed>(`${staticBase}offline/suara-sejati.json`),
    ]);
  const hymns =
    hymnResult.status === "fulfilled"
      ? hymnResult.value.items.flatMap((item) => {
          const parsed = HymnCatalogEntrySchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
  hymns.push(
    ...(await loadInstalledDistributedHymnCatalog(
      getDistributedAssetManager().getStore(),
    ).catch(() => [])),
  );
  const literature =
    literatureResult.status === "fulfilled"
      ? LiteratureCatalogSchema.parse(literatureResult.value)
      : {
          source: "tjc.org" as const,
          generatedAt: new Date(0).toISOString(),
          items: [],
        };
  const faith =
    faithResult.status === "fulfilled" ? faithResult.value : undefined;
  const sauh =
    sauhResult.status === "fulfilled"
      ? sauhResult.value.items.flatMap((item) => {
          const parsed = SauhPostSchema.safeParse(item);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
  const suara =
    suaraResult.status === "fulfilled"
      ? SuaraSejatiFeedSchema.parse(suaraResult.value)
      : {
          source: "tjc.org" as const,
          generatedAt: new Date(0).toISOString(),
          items: [],
        };

  // A configured BFF can provide fresher online catalogs. Static packs remain
  // the reliable baseline, so a transient BFF failure never empties search.
  if (base && typeof navigator !== "undefined" && navigator.onLine) {
    const online = await Promise.allSettled([
      readJson<LiteratureCatalog>(`${base}/api/v1/content/literature`),
      readJson<{ items: unknown[] }>(`${base}/api/v1/content/sauh`),
      readJson<SuaraSejatiFeed>(`${base}/api/v1/content/suara-sejati`),
    ]);
    const freshLiterature =
      online[0]?.status === "fulfilled"
        ? LiteratureCatalogSchema.safeParse(online[0].value)
        : undefined;
    const freshSauh =
      online[1]?.status === "fulfilled" && Array.isArray(online[1].value.items)
        ? online[1].value.items.flatMap((item) => {
            const parsed = SauhPostSchema.safeParse(item);
            return parsed.success ? [parsed.data] : [];
          })
        : undefined;
    const freshSuara =
      online[2]?.status === "fulfilled"
        ? SuaraSejatiFeedSchema.safeParse(online[2].value)
        : undefined;
    return createIndex(
      hymns,
      freshLiterature?.success ? freshLiterature.data : literature,
      faith,
      freshSauh ?? sauh,
      freshSuara?.success ? freshSuara.data : suara,
    );
  }
  return createIndex(hymns, literature, faith, sauh, suara);
}

function ensureIndex() {
  indexPromise ??= loadSearchIndex().catch((error) => {
    indexPromise = undefined;
    throw error;
  });
  return indexPromise;
}

const labels: Record<SearchKind, string> = {
  hymn: "Kidung",
  literature: "Literatur",
  faith: "Iman",
  sauh: "Sauh Bagi Jiwa",
  suara: "Suara Sejati",
  bible: "Alkitab",
};

export function GlobalSearch({
  locale,
  open,
  onClose,
}: {
  locale: Locale;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [bibleEntries, setBibleEntries] = useState<BibleSearchEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bibleClientRef = useRef<BibleSearchClient | undefined>(undefined);
  const bibleSequenceRef = useRef(0);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setStatus("loading");
    void ensureIndex()
      .then((value) => {
        setEntries(value);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const onAssetsChanged = () => {
      indexPromise = undefined;
      if (!open) return;
      setStatus("loading");
      void ensureIndex()
        .then((value) => {
          setEntries(value);
          setStatus("ready");
        })
        .catch(() => setStatus("error"));
    };
    window.addEventListener("gys-distributed-assets-change", onAssetsChanged);
    return () =>
      window.removeEventListener(
        "gys-distributed-assets-change",
        onAssetsChanged,
      );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  // The Bible index is heavy, so it is loaded on demand and searched through
  // the same worker-backed client as the Bible screen. A stale search result
  // (query changed, modal closed, or a newer request superseded this one) is
  // discarded before it can reach the result list.
  useEffect(() => {
    const normalized = deferredQuery.trim();
    if (!open || normalized.length < 2) {
      setBibleEntries([]);
      return;
    }
    let cancelled = false;
    const sequence = ++bibleSequenceRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const pack = await loadBiblePack();
          if (cancelled || sequence !== bibleSequenceRef.current) return;
          const client =
            bibleClientRef.current ??
            new BibleSearchClient(pack.verses, undefined, bibleBookNames(pack));
          bibleClientRef.current = client;
          const verses = await client.search(normalized);
          if (cancelled || sequence !== bibleSequenceRef.current) return;
          setBibleEntries(bibleVerseEntries(pack, verses));
        } catch (error: unknown) {
          if (!cancelled) recordDiagnostic("warn", "search.bible", error);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredQuery, open]);

  useEffect(
    () => () => {
      bibleSequenceRef.current += 1;
      bibleClientRef.current?.dispose();
      bibleClientRef.current = undefined;
    },
    [],
  );

  const results = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase(locale);
    if (normalized.length < 2) return [];
    return entries
      .filter((entry) =>
        entry.searchText.toLocaleLowerCase(locale).includes(normalized),
      )
      .slice(0, 30);
  }, [deferredQuery, entries, locale]);

  // Curated title matches stay first; verse-level Bible matches are appended
  // so the existing hymn-first navigation contract keeps its behavior.
  const mergedResults = useMemo(
    () => (bibleEntries.length ? [...results, ...bibleEntries] : results),
    [results, bibleEntries],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();
  const openResult = (entry: SearchEntry | BibleSearchEntry) => {
    onClose();
    if (entry.href) navigate(entry.href);
  };

  if (!open) return null;
  return (
    <div
      className="search-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="global-search"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
      >
        <div className="global-search-heading">
          <div>
            <p className="date-line">{translate(locale, "search.eyebrow")}</p>
            <h2 id="global-search-title">
              {translate(locale, "search.title")}
            </h2>
          </div>
          <button className="text-button" type="button" onClick={onClose}>
            {translate(locale, "search.close")} <kbd>Esc</kbd>
          </button>
        </div>
        <form onSubmit={submit} role="search" className="global-search-form">
          <label htmlFor="global-search-input">
            {translate(locale, "search.label")}
          </label>
          <input
            ref={inputRef}
            id="global-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate(locale, "search.placeholder")}
            autoComplete="off"
          />
        </form>
        {status === "loading" && (
          <p className="global-search-status" role="status">
            {translate(locale, "search.loading")}
          </p>
        )}
        {status === "error" && (
          <p className="global-search-status is-error" role="alert">
            {translate(locale, "search.error")}
          </p>
        )}
        {status === "ready" && deferredQuery.trim().length < 2 && (
          <p className="global-search-status">
            {translate(locale, "search.ready", {
              count: entries.length.toLocaleString(locale),
            })}
          </p>
        )}
        {status === "ready" &&
          deferredQuery.trim().length >= 2 &&
          !mergedResults.length && (
            <p className="global-search-status">
              {translate(locale, "search.empty", {
                query: deferredQuery.trim(),
              })}
            </p>
          )}
        {mergedResults.length > 0 && (
          <div
            className="global-search-results"
            role="listbox"
            aria-label={translate(locale, "search.results")}
          >
            {mergedResults.map((entry) => (
              <button
                type="button"
                className="global-search-result"
                key={`${entry.kind}-${entry.id}`}
                onClick={() => openResult(entry)}
              >
                <span
                  className={`search-result-mark is-${entry.kind}`}
                  aria-hidden="true"
                >
                  {labels[entry.kind].slice(0, 1)}
                </span>
                <span>
                  <strong>{entry.title}</strong>
                  <small>{entry.detail}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
