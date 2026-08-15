import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  LiteratureCatalogSchema,
  type LiteratureCategory,
  type LiteratureItem,
} from "@gys/contracts";
import { type Locale } from "./i18n.js";
import { Select } from "./select.js";
import { isFavorite, subscribeFavorites, toggleFavorite } from "./favorites.js";
import { assetStore } from "./asset-store.js";
import { fetchOnlineArticle } from "./online-article.js";
import {
  getRecentLiteratureIds,
  isResumeLocationValid,
  readLiteratureProgress,
  saveLiteratureProgress,
  subscribeLiteratureProgress,
  type LiteratureLocation,
  type LiteratureProgress,
} from "./literature-progress.js";
import { recordDiagnostic } from "./diagnostics.js";

const LiteraturePdfReader = lazy(() =>
  import("./pdf.js").then(({ PdfReader: Component }) => ({
    default: Component,
  })),
);

function literaturePdfUrl(sourceUrl: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  return base
    ? `${base.replace(/\/$/, "")}/api/v1/content/pdf?url=${encodeURIComponent(sourceUrl)}`
    : sourceUrl;
}

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
      const catalog = LiteratureCatalogSchema.parse(await response.json());
      // The Worker can be refreshed independently from the checked-in pack.
      // Merge the verified cover index from the same revision so a BFF catalog
      // never regresses to generic covers while its HTML parser is updating.
      if (url !== `${import.meta.env.BASE_URL}offline/literature.json`) {
        try {
          const snapshotResponse = await fetch(
            `${import.meta.env.BASE_URL}offline/literature.json`,
            { signal, cache: "force-cache" },
          );
          if (snapshotResponse.ok) {
            const snapshot = LiteratureCatalogSchema.parse(
              await snapshotResponse.json(),
            );
            const covers = new Map(
              snapshot.items
                .filter((item) => item.imageUrl)
                .map((item) => [item.id, item.imageUrl]),
            );
            return {
              ...catalog,
              items: catalog.items.map((item) => ({
                ...item,
                ...(item.imageUrl || !covers.get(item.id)
                  ? {}
                  : { imageUrl: covers.get(item.id) }),
              })),
            };
          }
        } catch {
          // A valid BFF catalog remains usable without its optional cover map.
        }
      }
      return catalog;
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  const failure =
    lastError instanceof Error
      ? lastError
      : new Error("Literature catalog unavailable");
  recordDiagnostic("error", "literature.catalog", failure);
  throw failure;
}

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; items: LiteratureItem[] }
  | { status: "error" };

function useLiteratureCatalog() {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void loadCatalog(controller.signal)
      .then((catalog) =>
        setState({
          status: "ready",
          items: [
            ...new Map(catalog.items.map((item) => [item.id, item])).values(),
          ],
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);
  return state;
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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.imageUrl]);
  const initials = item.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return item.imageUrl && !failed ? (
    <img
      className={`literature-cover ${compact ? "is-compact" : ""}`}
      src={item.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
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
  const catalogState = useLiteratureCatalog();
  const items = catalogState.status === "ready" ? catalogState.items : [];
  const status = catalogState.status;
  const [category, setCategory] = useState<LiteratureCategory | "all">("all");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);
  const deferredQuery = useDeferredValue(query);
  const [progressRevision, setProgressRevision] = useState(0);

  useEffect(
    () =>
      subscribeLiteratureProgress(() =>
        setProgressRevision((value) => value + 1),
      ),
    [],
  );

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
  const progressMap = useMemo(
    () =>
      readLiteratureProgress(
        new Map(items.map((item) => [item.id, item.updatedAt])),
      ),
    [items, progressRevision],
  );
  const recentItems = useMemo(
    () =>
      getRecentLiteratureIds(12)
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is LiteratureItem => Boolean(item))
        .filter((item) => {
          const entry = progressMap[item.id];
          return Boolean(
            entry &&
            (entry.resourceVersion === item.updatedAt ||
              entry.resourceVersion === "legacy"),
          );
        }),
    [items, progressMap],
  );

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
                <Link
                  className="literature-shelf-item"
                  to={`/literatur/${encodeURIComponent(item.id)}`}
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
                </Link>
              ))}
            </div>
          </section>
        )}

      {status === "ready" && recentItems.length > 0 && (
        <section
          className="literature-recent"
          aria-labelledby="literature-recent-title"
        >
          <div className="section-title-row">
            <div>
              <p className="date-line">Perangkat ini</p>
              <h2 id="literature-recent-title">Terakhir dilihat</h2>
            </div>
            <span>{recentItems.length} bacaan</span>
          </div>
          <div className="literature-recent-list">
            {recentItems.map((item) => {
              const entry = progressMap[item.id];
              const percent = entry?.percent ?? 0;
              return (
                <Link
                  className="literature-recent-item"
                  to={`/literatur/${encodeURIComponent(item.id)}`}
                  key={item.id}
                >
                  <Cover item={item} compact />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {percent > 0 ? `${percent}% selesai` : "Belum dimulai"} ·{" "}
                      {entry?.lastOpenedAt
                        ? new Date(entry.lastOpenedAt).toLocaleDateString(
                            locale,
                          )
                        : "baru dibuka"}
                    </small>
                    <progress
                      value={percent}
                      max={100}
                      aria-label={`Kemajuan ${item.title}`}
                    />
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              );
            })}
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
                  <Link
                    className="literature-row"
                    to={`/literatur/${encodeURIComponent(item.id)}`}
                    key={item.id}
                  >
                    <Cover item={item} />
                    <span className="literature-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {formatLabels[item.format]} ·{" "}
                        {dateLabel(item.publishedAt, locale)}
                      </small>
                      <em>Buka detail</em>
                    </span>
                    <span className="literature-arrow" aria-hidden="true">
                      ›
                    </span>
                  </Link>
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

function itemFromRoute(items: LiteratureItem[], encodedId: string | undefined) {
  if (!encodedId) return undefined;
  try {
    const id = decodeURIComponent(encodedId);
    return items.find((item) => item.id === id);
  } catch {
    return undefined;
  }
}

export function LiteratureDetailPage({ locale }: { locale: Locale }) {
  const { itemId } = useParams();
  const catalogState = useLiteratureCatalog();
  const item =
    catalogState.status === "ready"
      ? itemFromRoute(catalogState.items, itemId)
      : undefined;
  const [progress, setProgress] = useState<LiteratureProgress>();
  const progressRef = useRef<LiteratureProgress | undefined>(undefined);
  const [favorite, setFavorite] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<
    "idle" | "checking" | "downloading" | "ready" | "error"
  >("idle");
  const [notice, setNotice] = useState("");
  const [pdfBytes, setPdfBytes] = useState<Uint8Array>();
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerError, setReaderError] = useState("");
  const [articleOpen, setArticleOpen] = useState(false);
  const [articleStatus, setArticleStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [articleBody, setArticleBody] = useState<string>();
  const resourceVersion = item?.updatedAt ?? "unknown";
  const pdfSourceUrl =
    item?.format === "pdf" ? literaturePdfUrl(item.url) : undefined;
  const pdfAsset = useMemo(
    () =>
      item?.format === "pdf"
        ? {
            id: `literature-pdf:${item.id}`,
            kind: "pdf" as const,
            source: "remote" as const,
            path: pdfSourceUrl ?? item.url,
            url: pdfSourceUrl ?? item.url,
            version: resourceVersion,
            status: "remote" as const,
            lastUpdated: resourceVersion,
          }
        : undefined,
    [item, pdfSourceUrl, resourceVersion],
  );

  useEffect(() => {
    if (!item) return;
    const existing = readLiteratureProgress(
      new Map([[item.id, resourceVersion]]),
    )[item.id];
    const validExisting =
      existing &&
      (existing.resourceVersion === resourceVersion ||
        existing.resourceVersion === "legacy")
        ? existing
        : undefined;
    const opened: LiteratureProgress = {
      version: 2,
      percent: validExisting?.percent ?? 0,
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
      resourceVersion,
      ...(validExisting?.location ? { location: validExisting.location } : {}),
      ...(validExisting?.downloadedAt
        ? { downloadedAt: validExisting.downloadedAt }
        : {}),
    };
    saveLiteratureProgress(item.id, opened);
    setProgress(opened);
    progressRef.current = opened;
    setFavorite(isFavorite("literature", item.id));
    setArticleOpen(false);
    setArticleStatus("idle");
    setArticleBody(undefined);
    let cancelled = false;
    setDownloadStatus(item.format === "pdf" ? "checking" : "idle");
    void (async () => {
      if (!pdfAsset) {
        return;
      }
      const cached = await assetStore.get(pdfAsset);
      if (!cancelled) setDownloadStatus(cached ? "ready" : "idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [item, pdfAsset, resourceVersion]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    return subscribeLiteratureProgress(() => {
      if (!item) return;
      const next = readLiteratureProgress(
        new Map([[item.id, resourceVersion]]),
      )[item.id];
      if (next) {
        progressRef.current = next;
        setProgress(next);
      }
    });
  }, [item, resourceVersion]);

  useEffect(() => {
    if (!item) return;
    return subscribeFavorites(() => {
      setFavorite(isFavorite("literature", item.id));
    });
  }, [item]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const updateProgress = useCallback(
    (percent: number, location?: LiteratureLocation, completed = false) => {
      if (!item) return;
      const current = progressRef.current;
      const now = new Date().toISOString();
      const nextLocation = location ?? current?.location;
      const next: LiteratureProgress = {
        version: 2,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        updatedAt: now,
        lastOpenedAt: now,
        resourceVersion,
        ...(nextLocation ? { location: nextLocation } : {}),
        ...(current?.downloadedAt
          ? { downloadedAt: current.downloadedAt }
          : {}),
        ...(completed ? { completed: true } : {}),
      };
      saveLiteratureProgress(item.id, next);
      progressRef.current = next;
      setProgress(next);
    },
    [item, resourceVersion],
  );

  const onPageChange = useCallback(
    (page: number, totalPages: number) => {
      if (!item || totalPages < 1) return;
      const percent = (page / totalPages) * 100;
      updateProgress(
        percent,
        { kind: "page", page, totalPages },
        page >= totalPages,
      );
    },
    [item, updateProgress],
  );

  const openArticle = useCallback(async () => {
    if (!item || item.format === "pdf") return;
    setArticleOpen(true);
    setArticleStatus("loading");
    try {
      const article = await fetchOnlineArticle(item.url);
      setArticleBody(article.body);
      setArticleStatus("ready");
      updateProgress(Math.max(1, progressRef.current?.percent ?? 0));
    } catch {
      setArticleStatus("error");
    }
  }, [item, updateProgress]);

  const openReader = useCallback(async () => {
    if (!item || !pdfAsset) return;
    setReaderError("");
    try {
      const bytes =
        pdfBytes ??
        (downloadStatus === "ready"
          ? ((await assetStore.get(pdfAsset)) ??
            (await assetStore.download(pdfAsset)))
          : await assetStore.download(pdfAsset));
      if (!bytes || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
        throw new Error("not a PDF");
      setPdfBytes(bytes);
      setDownloadStatus("ready");
      setReaderOpen(true);
    } catch {
      setReaderError(
        "PDF belum dapat dibuka. Unduh ulang saat tersambung internet.",
      );
      setDownloadStatus("error");
    }
  }, [downloadStatus, item, pdfAsset, pdfBytes]);

  const toggle = () => {
    if (!item) return;
    const next = toggleFavorite({
      kind: "literature",
      id: item.id,
      title: item.title,
    });
    setFavorite(next);
    flash(next ? "Ditambahkan ke favorit perangkat." : "Dihapus dari favorit.");
  };

  const download = async () => {
    if (!item || !pdfAsset) return;
    setDownloadStatus("downloading");
    try {
      const bytes = await assetStore.download(pdfAsset);
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
        throw new Error("downloaded resource is not a PDF");
      setPdfBytes(bytes);
      const current = progressRef.current;
      const next: LiteratureProgress = {
        version: 2,
        percent: current?.percent ?? 0,
        updatedAt: current?.updatedAt ?? new Date().toISOString(),
        lastOpenedAt: new Date().toISOString(),
        resourceVersion,
        ...(current?.location ? { location: current.location } : {}),
        downloadedAt: new Date().toISOString(),
        ...(current?.completed ? { completed: true } : {}),
      };
      saveLiteratureProgress(item.id, next);
      progressRef.current = next;
      setProgress(next);
      setDownloadStatus("ready");
      flash("PDF tersimpan untuk dibaca offline.");
    } catch {
      setDownloadStatus("error");
      flash("PDF belum dapat disimpan. Periksa koneksi dan coba lagi.");
    }
  };

  const resumePage =
    progress?.location?.kind === "page" &&
    isResumeLocationValid(
      progress.location,
      resourceVersion,
      undefined,
      progress.resourceVersion,
    )
      ? progress.location.page
      : 1;

  if (catalogState.status === "loading")
    return (
      <div className="page">
        <div className="loading-panel" role="status">
          Membuka detail literatur…
        </div>
      </div>
    );
  if (catalogState.status === "error" || !item)
    return (
      <div className="page">
        <div className="error-panel" role="alert">
          <strong>Literatur tidak ditemukan</strong>
          <Link className="quiet-button" to="/literatur">
            Kembali ke katalog
          </Link>
        </div>
      </div>
    );
  const categoryLabel = labels[item.category];
  const progressPercent = progress?.percent ?? 0;
  const hasResume = Boolean(progress?.location || progressPercent > 0);
  return (
    <div
      className="page literature-detail-page"
      data-testid="literature-detail"
    >
      <div className="detail-back">
        <Link className="text-button" to="/literatur">
          ← Semua literatur
        </Link>
        <span>{categoryLabel}</span>
      </div>
      <section className="literature-detail-hero">
        <Cover item={item} />
        <div className="literature-detail-copy">
          <p className="date-line">Perpustakaan rohani · {categoryLabel}</p>
          <h1>{item.title}</h1>
          <p className="intro-copy">
            {item.description || "Bacaan resmi dari arsip Gereja Yesus Sejati."}
          </p>
          <div className="literature-detail-meta">
            <span>{formatLabels[item.format]}</span>
            <span>{dateLabel(item.publishedAt, locale)}</span>
          </div>
          <div className="detail-actions">
            {item.format === "pdf" ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => void openReader()}
              >
                {hasResume ? "Lanjutkan membaca" : "Baca di aplikasi"}
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => void openArticle()}
              >
                {hasResume ? "Lanjutkan membaca" : "Baca di aplikasi"}
              </button>
            )}
            <a
              className="quiet-button"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              Sumber resmi ↗
            </a>
            <button
              className="quiet-button"
              type="button"
              onClick={toggle}
              aria-pressed={favorite}
            >
              {favorite ? "★ Favorit" : "☆ Simpan favorit"}
            </button>
          </div>
        </div>
      </section>
      <section className="literature-reading-panel">
        <div className="section-title-row">
          <div>
            <p className="date-line">Perangkat ini</p>
            <h2>{hasResume ? "Lanjutkan membaca" : "Mulai membaca"}</h2>
          </div>
          <span>{progressPercent}%</span>
        </div>
        <progress
          value={progressPercent}
          max={100}
          aria-label={`Kemajuan membaca ${progressPercent}%`}
        />
        <div className="literature-progress-actions">
          {item.format === "pdf" && (
            <button
              className="quiet-button"
              type="button"
              onClick={() => void openReader()}
            >
              {hasResume ? `Lanjutkan dari halaman ${resumePage}` : "Buka PDF"}
            </button>
          )}
          <button
            className="quiet-button"
            type="button"
            onClick={() => updateProgress(Math.max(1, progressPercent))}
          >
            Tandai dibuka
          </button>
          <button
            className="quiet-button"
            type="button"
            onClick={() => updateProgress(100, progress?.location, true)}
          >
            Tandai selesai
          </button>
          {item.format === "pdf" && (
            <>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void download()}
                disabled={downloadStatus === "downloading"}
              >
                {downloadStatus === "downloading"
                  ? "Mengunduh…"
                  : downloadStatus === "ready"
                    ? "Perbarui PDF offline"
                    : "Unduh PDF"}
              </button>
              {downloadStatus === "ready" && (
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => void openReader()}
                >
                  Buka offline
                </button>
              )}
            </>
          )}
        </div>
        {readerError && (
          <p className="error-copy" role="alert">
            {readerError}
          </p>
        )}
        <small className="literature-progress-note">
          {progress?.location?.kind === "page"
            ? `Terakhir di halaman ${progress.location.page} dari ${progress.location.totalPages}. `
            : ""}
          {progress?.lastOpenedAt
            ? `Terakhir dibuka ${new Date(progress.lastOpenedAt).toLocaleDateString(locale)}`
            : "Kemajuan tersimpan di perangkat ini."}
        </small>
      </section>
      {readerOpen && pdfBytes && item.format === "pdf" && (
        <section
          className="literature-reader-panel"
          aria-label={`Membaca ${item.title}`}
        >
          <div className="section-title-row">
            <h2>PDF · {item.title}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setReaderOpen(false)}
            >
              Tutup
            </button>
          </div>
          <Suspense
            fallback={<div className="loading-panel">Memuat viewer PDF…</div>}
          >
            <LiteraturePdfReader
              src={pdfSourceUrl ?? item.url}
              data={pdfBytes}
              initialPage={resumePage}
              title={item.title}
              progressKey={`literature:${item.id}:${resourceVersion}`}
              onPageChange={onPageChange}
            />
          </Suspense>
        </section>
      )}
      {articleOpen && item.format !== "pdf" && (
        <section
          className="literature-reader-panel"
          aria-label={`Membaca ${item.title}`}
          data-testid="literature-article-reader"
        >
          <div className="section-title-row">
            <h2>{item.title}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setArticleOpen(false)}
            >
              Tutup
            </button>
          </div>
          {articleStatus === "loading" && (
            <div className="loading-panel" role="status">
              Memuat bacaan resmi di aplikasi…
            </div>
          )}
          {articleStatus === "error" && (
            <div className="error-panel" role="alert">
              <strong>Bacaan belum dapat dimuat di aplikasi.</strong>
              <span>
                Worker artikel belum tersedia atau sumber sedang bermasalah.
                Gunakan sumber resmi bila ingin membuka situs asal.
              </span>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void openArticle()}
              >
                Coba lagi
              </button>
            </div>
          )}
          {articleStatus === "ready" && articleBody && (
            <article className="online-article-body">
              {articleBody
                .split(/\n{2,}/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
                ))}
            </article>
          )}
        </section>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
