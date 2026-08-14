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
  buku: "Buku",
};
const categories: Array<LiteratureCategory | "all"> = [
  "all",
  "kesaksian",
  "warta",
  "panduan",
  "renungan",
  "pelita-kecil",
  "pujian",
  "buku",
];

async function loadCatalog(signal: AbortSignal) {
  const response = await fetch(
    `${import.meta.env.BASE_URL}offline/literature.json`,
    { signal, cache: "force-cache" },
  );
  if (!response.ok) throw new Error("Literature catalog unavailable");
  return LiteratureCatalogSchema.parse(await response.json());
}

export function LiteraturePage({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<LiteratureItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [category, setCategory] = useState<LiteratureCategory | "all">("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  useEffect(() => {
    const controller = new AbortController();
    void loadCatalog(controller.signal)
      .then((catalog) => {
        setItems(catalog.items);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, []);
  const filtered = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase(locale);
    return items.filter(
      (item) =>
        (category === "all" || item.category === category) &&
        (!normalized ||
          `${item.title} ${item.description}`
            .toLocaleLowerCase(locale)
            .includes(normalized)),
    );
  }, [category, deferredQuery, items, locale]);
  const grouped = useMemo(
    () =>
      categories
        .filter((value) => value !== "all")
        .map((value) => ({
          category: value,
          items: filtered.filter((item) => item.category === value),
        }))
        .filter((group) => group.items.length),
    [filtered],
  );
  return (
    <div className="page literature-page">
      <section className="page-intro">
        <div>
          <p className="date-line">tjc.org · koleksi bacaan</p>
          <h1>Literatur</h1>
          <p className="intro-copy">
            Jelajahi kesaksian, warta, panduan, dan bacaan rohani dalam tampilan
            seperti etalase buku yang ringan.
          </p>
        </div>
        <span className="pack-badge">{items.length || "—"} judul</span>
      </section>
      <section className="literature-toolbar">
        <label className="search-field">
          <span>Cari literatur</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Judul atau kata kunci…"
          />
        </label>
        <Select
          value={category}
          onChange={setCategory}
          label="Kategori"
          options={categories.map((value) => ({ value, label: labels[value] }))}
        />
      </section>
      {status === "loading" && (
        <div className="loading-panel" role="status">
          Mengambil katalog literatur…
        </div>
      )}
      {status === "error" && (
        <div className="error-panel" role="alert">
          <strong>Katalog literatur belum tersedia offline.</strong>
          <span>
            Periksa koneksi, lalu muat ulang untuk menyegarkan snapshot resmi.
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
        {grouped.map((group) => (
          <section className="literature-section" key={group.category}>
            <div className="section-title-row">
              <div>
                <p className="date-line">Koleksi</p>
                <h2>{labels[group.category]}</h2>
              </div>
              <span>{group.items.length} judul</span>
            </div>
            <div className="literature-list">
              {group.items.slice(0, 40).map((item) => (
                <a
                  className="literature-row"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  key={item.id}
                >
                  <span className="literature-cover" aria-hidden="true">
                    {item.title.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="literature-copy">
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                    <em>tjc.org · Buka bacaan ↗</em>
                  </span>
                  <span className="literature-arrow" aria-hidden="true">
                    ›
                  </span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
