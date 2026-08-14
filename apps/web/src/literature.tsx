import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  LiteratureCatalogSchema,
  type LiteratureCategory,
  type LiteratureItem,
} from "@gys/contracts";
import { type Locale } from "./i18n.js";
import { Select } from "./select.js";

const labels: Record<LiteratureCategory | "all", string> = {
  all: "Semua koleksi",
  kesaksian: "Kesaksian",
  warta: "Warta Sejati",
  panduan: "Panduan Alkitab",
  renungan: "Renungan",
  "pelita-kecil": "Pelita Kecil",
  pujian: "Pujian",
  buku: "Buku PDF",
};
const categoryOrder: LiteratureCategory[] = [
  "kesaksian",
  "warta",
  "pelita-kecil",
  "panduan",
  "renungan",
  "buku",
  "pujian",
];
const formatLabels: Record<LiteratureItem["format"], string> = {
  article: "Artikel",
  issue: "Edisi",
  pdf: "PDF",
};

async function loadCatalog(signal: AbortSignal) {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  const candidates = [
    base ? `${base.replace(/\/$/, "")}/api/v1/content/literature` : undefined,
    `${import.meta.env.BASE_URL}offline/literature.json`,
  ].filter((value): value is string => Boolean(value));
  let lastError: unknown;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { signal, cache: "no-cache" });
      if (!response.ok)
        throw new Error(`Literature request failed: ${response.status}`);
      return LiteratureCatalogSchema.parse(await response.json());
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Literature catalog unavailable");
}

function dateLabel(value: string | undefined, locale: Locale) {
  if (!value) return "Terbit sesuai arsip TJC";
  try {
    return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "Arsip TJC";
  }
}

function Cover({
  item,
  compact = false,
}: {
  item: LiteratureItem;
  compact?: boolean;
}) {
  const initials = item.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return item.imageUrl ? (
    <img
      className={`literature-cover ${compact ? "is-compact" : ""}`}
      src={item.imageUrl}
      alt=""
      loading="lazy"
    />
  ) : (
    <span
      className={`literature-cover literature-cover-${item.category} ${compact ? "is-compact" : ""}`}
      aria-hidden="true"
    >
      <small>{labels[item.category]}</small>
      <strong>{initials || "GYS"}</strong>
    </span>
  );
}

export function LiteraturePage({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<LiteratureItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [category, setCategory] = useState<LiteratureCategory | "all">("all");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const controller = new AbortController();
    void loadCatalog(controller.signal)
      .then((catalog) => {
        setItems([
          ...new Map(catalog.items.map((item) => [item.id, item])).values(),
        ]);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => setVisibleCount(40), [category, deferredQuery, sort]);

  const availableCategories = useMemo(
    () =>
      categoryOrder.filter((value) =>
        items.some((item) => item.category === value),
      ),
    [items],
  );
  const counts = useMemo(
    () =>
      new Map(
        availableCategories.map((value) => [
          value,
          items.filter((item) => item.category === value).length,
        ]),
      ),
    [availableCategories, items],
  );
  const filtered = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase(locale);
    return items
      .filter(
        (item) =>
          (category === "all" || item.category === category) &&
          (!normalized ||
            `${item.title} ${item.description} ${labels[item.category]}`
              .toLocaleLowerCase(locale)
              .includes(normalized)),
      )
      .sort((left, right) => {
        if (sort === "title")
          return left.title.localeCompare(right.title, locale);
        return (right.publishedAt ?? right.updatedAt).localeCompare(
          left.publishedAt ?? left.updatedAt,
        );
      });
  }, [category, deferredQuery, items, locale, sort]);
  const featured = useMemo(
    () =>
      items
        .filter((item) => item.format !== "pdf")
        .sort((left, right) =>
          (right.publishedAt ?? right.updatedAt).localeCompare(
            left.publishedAt ?? left.updatedAt,
          ),
        )
        .slice(0, 6),
    [items],
  );
  const grouped = useMemo(() => {
    if (category !== "all") return [{ category, items: filtered }];
    return availableCategories
      .map((value) => ({
        category: value,
        items: filtered.filter((item) => item.category === value),
      }))
      .filter((group) => group.items.length);
  }, [availableCategories, category, filtered]);
  const visibleItems =
    category === "all" ? filtered : filtered.slice(0, visibleCount);

  return (
    <div className="page literature-page">
      <section className="page-intro literature-intro">
        <div>
          <p className="date-line">tjc.org · perpustakaan rohani</p>
          <h1>Literatur</h1>
          <p className="intro-copy">
            Temukan bacaan, edisi warta, kesaksian, dan PDF pembinaan dari arsip
            resmi Gereja Yesus Sejati.
          </p>
        </div>
        <span className="pack-badge">{items.length || "—"} judul</span>
      </section>

      {status === "ready" &&
        featured.length > 0 &&
        !query &&
        category === "all" && (
          <section
            className="literature-featured"
            aria-labelledby="literature-featured-title"
          >
            <div className="section-title-row">
              <div>
                <p className="date-line">Pilihan terbaru</p>
                <h2 id="literature-featured-title">
                  Buka dan lanjutkan membaca
                </h2>
              </div>
              <span>{featured.length} pilihan</span>
            </div>
            <div className="literature-shelf">
              {featured.map((item) => (
                <a
                  className="literature-shelf-item"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  key={item.id}
                >
                  <Cover item={item} compact />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {labels[item.category]} ·{" "}
                      {dateLabel(item.publishedAt, locale)}
                    </small>
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

      <section className="literature-toolbar" aria-label="Filter literatur">
        <label className="search-field">
          <span>Cari literatur</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Judul, edisi, atau kata kunci…"
          />
        </label>
        <Select
          value={category}
          onChange={setCategory}
          label="Kategori"
          options={[
            { value: "all", label: "Semua koleksi" },
            ...availableCategories.map((value) => ({
              value,
              label: `${labels[value]} · ${counts.get(value) ?? 0}`,
            })),
          ]}
        />
        <Select
          value={sort}
          onChange={setSort}
          label="Urutkan"
          options={[
            { value: "recent", label: "Terbaru" },
            { value: "title", label: "Menurut judul" },
          ]}
        />
      </section>

      {status === "loading" && (
        <div className="loading-panel" role="status">
          Mengambil katalog literatur resmi…
        </div>
      )}
      {status === "error" && (
        <div className="error-panel" role="alert">
          <strong>Katalog literatur belum tersedia.</strong>
          <span>
            Periksa koneksi lalu muat ulang untuk mengambil snapshot resmi TJC.
          </span>
        </div>
      )}
      {status === "ready" && !filtered.length && (
        <div className="empty-state">
          <strong>Tidak ada judul yang cocok.</strong>
          <span>Coba kata kunci atau kategori lain.</span>
        </div>
      )}

      <div className="literature-sections">
        {grouped.map((group) => {
          const groupItems = category === "all" ? group.items : visibleItems;
          return (
            <section className="literature-section" key={group.category}>
              <div className="section-title-row">
                <div>
                  <p className="date-line">Koleksi resmi</p>
                  <h2>{labels[group.category]}</h2>
                </div>
                <span>{group.items.length} judul</span>
              </div>
              <div className="literature-list">
                {groupItems.map((item) => (
                  <a
                    className="literature-row"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    key={item.id}
                  >
                    <Cover item={item} />
                    <span className="literature-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {formatLabels[item.format]} ·{" "}
                        {dateLabel(item.publishedAt, locale)}
                      </small>
                      <em>Buka di tjc.org ↗</em>
                    </span>
                    <span className="literature-arrow" aria-hidden="true">
                      ›
                    </span>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {category !== "all" && visibleCount < filtered.length && (
        <button
          className="secondary-button literature-more"
          type="button"
          onClick={() => setVisibleCount((count) => count + 40)}
        >
          Muat 40 judul lagi
        </button>
      )}
    </div>
  );
}
