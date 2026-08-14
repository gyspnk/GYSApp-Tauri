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
import type { Locale } from "./i18n.js";

type SearchKind = "hymn" | "literature" | "faith" | "sauh" | "suara";
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
  const inputRef = useRef<HTMLInputElement>(null);
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
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const results = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase(locale);
    if (normalized.length < 2) return [];
    return entries
      .filter((entry) =>
        entry.searchText.toLocaleLowerCase(locale).includes(normalized),
      )
      .slice(0, 30);
  }, [deferredQuery, entries, locale]);

  const submit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();
  const openResult = (entry: SearchEntry) => {
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
            <p className="date-line">Pencarian lintas ruang</p>
            <h2 id="global-search-title">Temukan sesuatu</h2>
          </div>
          <button className="text-button" type="button" onClick={onClose}>
            Tutup <kbd>Esc</kbd>
          </button>
        </div>
        <form onSubmit={submit} role="search" className="global-search-form">
          <label htmlFor="global-search-input">
            Cari Kidung, Literatur, Iman, atau media
          </label>
          <input
            ref={inputRef}
            id="global-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ketik minimal 2 karakter…"
            autoComplete="off"
          />
        </form>
        {status === "loading" && (
          <p className="global-search-status" role="status">
            Menyiapkan indeks lokal…
          </p>
        )}
        {status === "error" && (
          <p className="global-search-status is-error" role="alert">
            Indeks belum tersedia. Coba muat ulang aplikasi.
          </p>
        )}
        {status === "ready" && deferredQuery.trim().length < 2 && (
          <p className="global-search-status">
            Cari di {entries.length.toLocaleString(locale)} judul dan pokok
            konten.
          </p>
        )}
        {status === "ready" &&
          deferredQuery.trim().length >= 2 &&
          !results.length && (
            <p className="global-search-status">
              Tidak ada hasil untuk “{deferredQuery.trim()}”.
            </p>
          )}
        {results.length > 0 && (
          <div
            className="global-search-results"
            role="listbox"
            aria-label="Hasil pencarian"
          >
            {results.map((entry) => (
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
