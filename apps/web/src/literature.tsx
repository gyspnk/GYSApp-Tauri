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
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { createPortal } from "react-dom";
import {
  LiteratureCatalogSchema,
  type LiteratureCategory,
  type LiteratureItem,
} from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import { Icon } from "./icons.js";
import { Select } from "./select.js";
import { isFavorite, subscribeFavorites, toggleFavorite } from "./favorites.js";
import { assetStore } from "./asset-store.js";
import { fetchOnlineArticle } from "./online-article.js";
import { LazyImage } from "./lazy-image.js";
import { bffPdfUrl } from "./pdf-source.js";
import {
  getRecentLiteratureIds,
  isLiteratureProgressCompatible,
  isResumeLocationValid,
  literaturePagePercent,
  literatureResourceVersion,
  readLiteratureProgress,
  removeLiteratureProgress,
  saveLiteratureProgress,
  subscribeLiteratureProgress,
  type LiteratureLocation,
  type LiteratureProgress,
} from "./literature-progress.js";
import { recordDiagnostic } from "./diagnostics.js";
import { rememberDialogOpener, useDialogFocus } from "./dialog-focus.js";

const LiteraturePdfReader = lazy(() =>
  import("./pdf.js").then(({ PdfReader: Component }) => ({
    default: Component,
  })),
);

const ISSUE_PDF_CACHE = new Map<string, string>();

/**
 * Warta Sejati “issue” pages are hub posts: the actual newsletter PDF lives
 * inside the post content as a tjc.org `.pdf` link. Resolve it once so the
 * Baca-lanjut flow opens the PDF viewer (jump halaman, nomor halaman, resume)
 * instead of the raw text fallback.
 */
async function resolveIssuePdfUrl(
  sourceUrl: string,
): Promise<string | undefined> {
  const cached = ISSUE_PDF_CACHE.get(sourceUrl);
  if (cached) return cached;
  try {
    const slug = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop();
    if (!slug) return undefined;
    const endpoint = new URL("https://tjc.org/id/wp-json/wp/v2/posts");
    endpoint.searchParams.set("slug", slug);
    endpoint.searchParams.set("per_page", "1");
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const payload: unknown = await response.json();
    const first = Array.isArray(payload) ? payload[0] : undefined;
    const rendered =
      first && typeof first === "object"
        ? (first as { content?: { rendered?: unknown } }).content?.rendered
        : undefined;
    const matches =
      typeof rendered === "string"
        ? rendered.match(/https:\/\/[^"'<>\s]+\.pdf(?:\?[^"'<>\s]*)?/gi)
        : undefined;
    const direct = matches?.find((value) => {
      try {
        const url = new URL(value);
        return [
          "tjc.org",
          "www.tjc.org",
          "tjcorguploads.s3.amazonaws.com",
        ].includes(url.hostname.toLowerCase());
      } catch {
        return false;
      }
    });
    if (direct) {
      ISSUE_PDF_CACHE.set(sourceUrl, direct);
      return direct;
    }
  } catch {
    // offline/transient failure: keep the text reader fallback
  }
  return undefined;
}

import {
  fetchLiteratureCatalog,
  literatureCategoryLabels,
} from "./literature-catalog.js";

export { fetchLiteratureCatalog, literatureCategoryLabels };

const labels = literatureCategoryLabels;
const categoryKeys: Record<LiteratureCategory | "all", string> = {
  all: "literature.category.all",
  kesaksian: "literature.category.kesaksian",
  warta: "literature.category.warta",
  "pelita-kecil": "literature.category.pelitaKecil",
  panduan: "literature.category.panduan",
  renungan: "literature.category.renungan",
  buku: "literature.category.buku",
  pujian: "literature.category.pujian",
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
const formatKeys: Record<LiteratureItem["format"], string> = {
  article: "literature.format.article",
  issue: "literature.format.issue",
  pdf: "literature.format.pdf",
};

function categoryLabel(locale: Locale, category: LiteratureCategory | "all") {
  return translate(locale, categoryKeys[category]);
}

function formatLabel(locale: Locale, format: LiteratureItem["format"]) {
  return translate(locale, formatKeys[format]);
}

function literatureHref(item: LiteratureItem): string {
  const directRead = item.format === "pdf" || item.format === "issue";
  return `/literatur/${encodeURIComponent(item.id)}${directRead ? "?read=1" : ""}`;
}

function literatureRowAction(
  item: LiteratureItem,
  progress: LiteratureProgress | undefined,
  locale: Locale,
): string {
  if (item.format === "article")
    return translate(locale, "literature.openReading");
  if (progress?.location?.kind === "page") {
    return translate(locale, "literature.resumePage", {
      page: progress.location.page,
    });
  }
  return translate(locale, "literature.readPdf");
}

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; items: LiteratureItem[] }
  | { status: "error" };

function useLiteratureCatalog() {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void fetchLiteratureCatalog(controller.signal)
      .then((items) => setState({ status: "ready", items }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);
  return state;
}

function dateLabel(value: string | undefined, locale: Locale) {
  if (!value) return translate(locale, "literature.dateArchived");
  try {
    return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return translate(locale, "literature.archiveLabel");
  }
}

function readDocumentScrollRatio(): number {
  if (typeof window === "undefined" || typeof document === "undefined")
    return 0;
  const root = document.documentElement;
  const max = Math.max(0, root.scrollHeight - window.innerHeight);
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function scrollDocumentToRatio(
  ratio: number,
  behavior: ScrollBehavior = "smooth",
) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const root = document.documentElement;
  const max = Math.max(0, root.scrollHeight - window.innerHeight);
  window.scrollTo({
    top: max * Math.min(1, Math.max(0, ratio)),
    behavior,
  });
}

function Cover({
  item,
  compact = false,
  loading = "lazy",
  fetchPriority,
  fallbackCategory,
  coverAlt,
}: {
  item: LiteratureItem;
  compact?: boolean;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  fallbackCategory?: string;
  coverAlt?: string;
}) {
  return (
    <LazyImage
      wrapperClassName={`literature-cover${compact ? " is-compact" : ""}${item.imageUrl ? "" : " is-coverless"}`}
      src={item.imageUrl}
      fallbackTitle={item.title}
      fallbackCategory={fallbackCategory ?? labels[item.category]}
      alt={coverAlt ?? `Sampul ${item.title}`}
      loading={loading}
      fetchPriority={fetchPriority}
    />
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
            `${item.title} ${item.description} ${categoryLabel(locale, item.category)}`
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
        new Map(
          items.map((item) => [
            item.id,
            literatureResourceVersion(item.publishedAt),
          ]),
        ),
      ),
    [items, progressRevision],
  );
  const recentItems = useMemo(
    () =>
      getRecentLiteratureIds(12)
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is LiteratureItem => Boolean(item)),
    [items, progressRevision],
  );

  return (
    <div className="page literature-page">
      <section className="page-intro literature-intro">
        <div>
          <p className="date-line">
            {translate(locale, "literature.eyebrow")}
          </p>
          <h1>{translate(locale, "literature.title")}</h1>
          <p className="intro-copy">{translate(locale, "literature.intro")}</p>
        </div>
        <span className="pack-badge">
          {translate(locale, "literature.itemCount", {
            count: items.length || "—",
          })}
        </span>
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
                <p className="date-line">
                  {translate(locale, "literature.latest")}
                </p>
                <h2 id="literature-featured-title">
                  {translate(locale, "literature.continueReading")}
                </h2>
              </div>
              <span>
                {translate(locale, "literature.featuredCount", {
                  count: featured.length,
                })}
              </span>
            </div>
            <div className="literature-shelf">
              {featured.map((item, index) => (
                <Link
                  className="literature-shelf-item"
                  to={literatureHref(item)}
                  key={item.id}
                >
                  <Cover
                    item={item}
                    compact
                    fallbackCategory={categoryLabel(locale, item.category)}
                    coverAlt={translate(locale, "home.coverAlt", {
                      title: item.title,
                    })}
                    loading={index < 3 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                  />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {categoryLabel(locale, item.category)} ·{" "}
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
              <p className="date-line">
                {translate(locale, "literature.thisDevice")}
              </p>
              <h2 id="literature-recent-title">
                {translate(locale, "literature.lastViewed")}
              </h2>
            </div>
            <span>
              {translate(locale, "literature.readingCount", {
                count: recentItems.length,
              })}
            </span>
          </div>
          <div className="literature-recent-list">
            {recentItems.map((item) => {
              const entry = progressMap[item.id];
              const percent = entry?.percent ?? 0;
              return (
                <div className="literature-recent-item" key={item.id}>
                  <Link
                    className="literature-recent-link"
                    to={literatureHref(item)}
                  >
                    <Cover
                      item={item}
                      compact
                      fallbackCategory={categoryLabel(locale, item.category)}
                      coverAlt={translate(locale, "home.coverAlt", {
                        title: item.title,
                      })}
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {percent > 0
                          ? translate(locale, "literature.percentComplete", {
                              percent,
                            })
                          : translate(locale, "literature.notStarted")}{" "}
                        ·{" "}
                        {entry?.lastOpenedAt
                          ? new Date(entry.lastOpenedAt).toLocaleDateString(
                              locale,
                            )
                          : translate(locale, "literature.justOpened")}
                      </small>
                      <progress
                        value={percent}
                        max={100}
                        aria-label={translate(locale, "literature.progressAria", {
                          title: item.title,
                        })}
                      />
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                  <button
                    className="literature-recent-remove"
                    type="button"
                    aria-label={translate(locale, "literature.removeRecent", {
                      title: item.title,
                    })}
                    title={translate(locale, "literature.removeFromRecent")}
                    onClick={() => {
                      removeLiteratureProgress(item.id);
                      setProgressRevision((r) => r + 1);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section
        className="literature-toolbar"
        aria-label={translate(locale, "literature.filter")}
      >
        <label className="search-field">
          <span>{translate(locale, "literature.search")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate(locale, "literature.searchPlaceholder")}
          />
        </label>
        <Select
          value={category}
          onChange={setCategory}
          label={translate(locale, "literature.categoryLabel")}
          options={[
            {
              value: "all",
              label: categoryLabel(locale, "all"),
            },
            ...availableCategories.map((value) => ({
              value,
              label: `${categoryLabel(locale, value)} · ${counts.get(value) ?? 0}`,
            })),
          ]}
        />
        <Select
          value={sort}
          onChange={setSort}
          label={translate(locale, "literature.sortLabel")}
          options={[
            {
              value: "recent",
              label: translate(locale, "literature.sortRecent"),
            },
            {
              value: "title",
              label: translate(locale, "literature.sortTitle"),
            },
          ]}
        />
      </section>

      {status === "loading" && (
        <div className="loading-panel" role="status">
          {translate(locale, "literature.loading")}
        </div>
      )}
      {status === "error" && (
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "literature.errorTitle")}</strong>
          <span>{translate(locale, "literature.errorBody")}</span>
        </div>
      )}
      {status === "ready" && !filtered.length && (
        <div className="empty-state">
          <strong>{translate(locale, "literature.emptyTitle")}</strong>
          <span>{translate(locale, "literature.emptyBody")}</span>
        </div>
      )}

      <div className="literature-sections">
        {grouped.map((group) => {
          const groupItems = category === "all" ? group.items : visibleItems;
          return (
            <section className="literature-section" key={group.category}>
              <div className="section-title-row">
                <div>
                  <p className="date-line">
                    {translate(locale, "literature.officialCollection")}
                  </p>
                  <h2>{categoryLabel(locale, group.category)}</h2>
                </div>
                <span>
                  {translate(locale, "literature.itemCount", {
                    count: group.items.length,
                  })}
                </span>
              </div>
              <div className="literature-list">
                {groupItems.map((item) => (
                  <Link
                    className="literature-row"
                    to={literatureHref(item)}
                    key={item.id}
                  >
                    <Cover
                      item={item}
                      fallbackCategory={categoryLabel(locale, item.category)}
                      coverAlt={translate(locale, "home.coverAlt", {
                        title: item.title,
                      })}
                    />
                    <span className="literature-copy">
                      <strong>{item.title}</strong>
                      <small>
                        {formatLabel(locale, item.format)} ·{" "}
                        {dateLabel(item.publishedAt, locale)}
                      </small>
                      <em>
                        {literatureRowAction(
                          item,
                          progressMap[item.id],
                          locale,
                        )}
                      </em>
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
          {translate(locale, "literature.loadMore", { count: 40 })}
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const directRead = searchParams.get("read") === "1";
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
  const [readerOpen, setReaderOpen] = useState(false);
  const readerDialogRef = useRef<HTMLDivElement | null>(null);
  const readerOpenerRef = useRef<HTMLElement | null>(null);
  const closeReader = () => {
    if (directRead) {
      navigate("/literatur");
      return;
    }
    setReaderOpen(false);
  };
  const [articleOpen, setArticleOpen] = useState(false);
  const [articleStatus, setArticleStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [articleBody, setArticleBody] = useState<string>();
  const articleScrollTimer = useRef<number | undefined>(undefined);
  const articleRestoreFrame = useRef<number | undefined>(undefined);
  const resourceVersion = literatureResourceVersion(item?.publishedAt);
  const [issuePdfUrl, setIssuePdfUrl] = useState<string>();
  const [issuePdfStatus, setIssuePdfStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  useEffect(() => {
    if (item?.format !== "issue") {
      setIssuePdfUrl(undefined);
      setIssuePdfStatus("idle");
      return;
    }
    let cancelled = false;
    setIssuePdfUrl(undefined);
    setIssuePdfStatus("loading");
    void resolveIssuePdfUrl(item.url).then((url) => {
      if (cancelled) return;
      setIssuePdfUrl(url);
      setIssuePdfStatus(url ? "ready" : "error");
    });
    return () => {
      cancelled = true;
    };
  }, [item]);
  const actualPdfUrl =
    item?.format === "pdf"
      ? item.url
      : item?.format === "issue"
        ? issuePdfUrl
        : undefined;
  const isPdfItem = item?.format === "pdf" || item?.format === "issue";
  const isPdfUnavailable =
    isPdfItem && item?.format === "issue" && issuePdfStatus === "error";
  const pdfSourceUrl = actualPdfUrl ? bffPdfUrl(actualPdfUrl) : undefined;
  const pdfAsset = useMemo(
    () =>
      item && isPdfItem && actualPdfUrl
        ? {
            id: `literature-pdf:${item.id}`,
            kind: "pdf" as const,
            source: "remote" as const,
            path: pdfSourceUrl ?? actualPdfUrl,
            url: pdfSourceUrl ?? actualPdfUrl,
            version: resourceVersion,
            status: "remote" as const,
            lastUpdated: resourceVersion,
          }
        : undefined,
    [item, actualPdfUrl, isPdfItem, pdfSourceUrl, resourceVersion],
  );

  useEffect(() => {
    if (!item) return;
    const existing = readLiteratureProgress(
      new Map([[item.id, resourceVersion]]),
    )[item.id];
    const validExisting = isLiteratureProgressCompatible(existing, item)
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
    setDownloadStatus(pdfAsset ? "checking" : "idle");
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
      } else {
        progressRef.current = undefined;
        setProgress(undefined);
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

  useEffect(() => {
    if (!articleOpen || articleStatus !== "ready" || !articleBody) return;
    const saved = progressRef.current?.location;
    if (
      saved?.kind === "scroll" &&
      isResumeLocationValid(
        saved,
        resourceVersion,
        undefined,
        progressRef.current?.resourceVersion,
      )
    ) {
      articleRestoreFrame.current = window.requestAnimationFrame(() => {
        articleRestoreFrame.current = undefined;
        scrollDocumentToRatio(saved.ratio, "auto");
      });
    }
    const saveScroll = () => {
      if (articleScrollTimer.current !== undefined) return;
      articleScrollTimer.current = window.setTimeout(() => {
        articleScrollTimer.current = undefined;
        const ratio = readDocumentScrollRatio();
        updateProgress(ratio * 100, { kind: "scroll", ratio }, ratio >= 0.98);
      }, 350);
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", saveScroll);
      if (articleScrollTimer.current !== undefined) {
        window.clearTimeout(articleScrollTimer.current);
        articleScrollTimer.current = undefined;
      }
      if (articleRestoreFrame.current !== undefined) {
        window.cancelAnimationFrame(articleRestoreFrame.current);
        articleRestoreFrame.current = undefined;
      }
    };
  }, [
    articleBody,
    articleOpen,
    articleStatus,
    resourceVersion,
    updateProgress,
  ]);

  const onPageChange = useCallback(
    (page: number, totalPages: number) => {
      if (!item || totalPages < 1) return;
      const percent = literaturePagePercent(page, totalPages);
      updateProgress(
        percent,
        { kind: "page", page, totalPages },
        page >= totalPages,
      );
    },
    [item, updateProgress],
  );

  const openArticle = useCallback(async () => {
    if (!item || item.format !== "article") return;
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

  const openReader = useCallback((trigger?: HTMLElement | null) => {
    if (!item || !pdfAsset) return;
    rememberDialogOpener(readerOpenerRef, trigger);
    setReaderOpen(true);
  }, [item, pdfAsset]);

  useDialogFocus({
    open: readerOpen && isPdfItem,
    dialogRef: readerDialogRef,
    openerRef: readerOpenerRef,
    onClose: closeReader,
    initialFocusSelector: ".literature-pdf-close",
  });

  useEffect(() => {
    if (!directRead || !isPdfItem || !pdfAsset || readerOpen)
      return;
    openReader();
  }, [directRead, isPdfItem, pdfAsset, readerOpen, openReader]);

  const toggle = () => {
    if (!item) return;
    const next = toggleFavorite({
      kind: "literature",
      id: item.id,
      title: item.title,
    });
    setFavorite(next);
    flash(
      translate(
        locale,
        next ? "literature.favoriteSaved" : "literature.favoriteRemoved",
      ),
    );
  };

  const download = async () => {
    if (!item || !pdfAsset) return;
    setDownloadStatus("downloading");
    try {
      const bytes = await assetStore.download(pdfAsset);
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
        throw new Error("downloaded resource is not a PDF");
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
      flash(translate(locale, "literature.pdfSaved"));
    } catch {
      setDownloadStatus("error");
      flash(translate(locale, "literature.pdfSaveError"));
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
  const resumeScrollRatio =
    progress?.location?.kind === "scroll" &&
    isResumeLocationValid(
      progress.location,
      resourceVersion,
      undefined,
      progress.resourceVersion,
    )
      ? progress.location.ratio
      : undefined;

  if (catalogState.status === "loading")
    return (
      <div className="page">
        <div className="loading-panel" role="status">
          {translate(locale, "literature.detailLoading")}
        </div>
      </div>
    );
  if (catalogState.status === "error" || !item)
    return (
      <div className="page">
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "literature.detailNotFound")}</strong>
          <Link className="quiet-button" to="/literatur">
            {translate(locale, "literature.backToCatalog")}
          </Link>
        </div>
      </div>
    );
  const itemCategoryLabel = categoryLabel(locale, item.category);
  const progressPercent = progress?.percent ?? 0;
  const hasResume = Boolean(progress?.location || progressPercent > 0);
  return (
    <div
      className={`page literature-detail-page${directRead && isPdfItem ? " is-direct-reader" : ""}`}
      data-testid="literature-detail"
    >
      <div className="detail-back">
        <Link className="text-button" to="/literatur">
          ← {translate(locale, "literature.backToLiterature")}
        </Link>
        <span>{itemCategoryLabel}</span>
      </div>
      <section className="literature-detail-hero">
        <Cover
          item={item}
          fallbackCategory={itemCategoryLabel}
          loading="eager"
          fetchPriority="high"
        />
        <div className="literature-detail-copy">
          <p className="date-line">
            {translate(locale, "literature.detailEyebrow")} · {itemCategoryLabel}
          </p>
          <h1>{item.title}</h1>
          <p className="intro-copy">
            {item.description ||
              translate(locale, "literature.detailDescriptionFallback")}
          </p>
          <div className="literature-detail-meta">
            <span>{formatLabel(locale, item.format)}</span>
            <span>{dateLabel(item.publishedAt, locale)}</span>
          </div>
          <div className="detail-actions">
            {isPdfItem ? (
              <button
                className="primary-button"
                type="button"
                onClick={(event) => openReader(event.currentTarget)}
                disabled={!pdfAsset}
              >
                {isPdfUnavailable
                  ? translate(locale, "literature.pdfUnavailable")
                  : hasResume
                    ? translate(locale, "literature.resumeReading")
                    : translate(locale, "literature.readInApp")}
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => void openArticle()}
              >
                {hasResume
                  ? translate(locale, "literature.resumeReading")
                  : translate(locale, "literature.readInApp")}
              </button>
            )}
            <a
              className="quiet-button"
              href={actualPdfUrl ?? item.url}
              target="_blank"
              rel="noreferrer"
            >
              {translate(
                locale,
                isPdfItem
                  ? "literature.officialPdf"
                  : "literature.officialSource",
              )}
            </a>
            <button
              className="quiet-button"
              type="button"
              onClick={toggle}
              aria-pressed={favorite}
            >
              {translate(
                locale,
                favorite ? "literature.favorite" : "literature.saveFavorite",
              )}
            </button>
          </div>
        </div>
      </section>
      {directRead &&
        isPdfItem &&
        !readerOpen &&
        !isPdfUnavailable && (
          <div
            className="loading-panel literature-direct-loading"
            role="status"
          >
            {translate(locale, "literature.preparePdf")}
          </div>
        )}
      {isPdfUnavailable && (
        <div className="error-panel literature-reader-error" role="alert">
          <strong>{translate(locale, "literature.pdfUnavailableTitle")}</strong>
          <span>{translate(locale, "literature.pdfUnavailableBody")}</span>
        </div>
      )}
      <section className="literature-reading-panel">
        <div className="section-title-row">
          <div>
            <p className="date-line">
              {translate(locale, "literature.deviceSection")}
            </p>
            <h2>
              {hasResume
                ? translate(locale, "literature.resumeReading")
                : translate(locale, "literature.startReading")}
            </h2>
          </div>
          <span>{progressPercent}%</span>
        </div>
        <progress
          value={progressPercent}
          max={100}
          aria-label={translate(locale, "literature.progressAriaDetail", {
            percent: progressPercent,
          })}
        />
        <details
          className="literature-reading-tools"
          open={!directRead || !isPdfItem}
        >
          <summary>{translate(locale, "literature.manageProgress")}</summary>
          <div className="literature-progress-actions">
            {isPdfItem && (
              <button
                className="quiet-button"
                type="button"
                  onClick={(event) => openReader(event.currentTarget)}
              >
                {hasResume
                  ? translate(locale, "literature.resumeFromPage", {
                      page: resumePage,
                    })
                  : translate(locale, "literature.openPdf")}
              </button>
            )}
            <button
              className="quiet-button"
              type="button"
              onClick={() => updateProgress(Math.max(1, progressPercent))}
            >
              {translate(locale, "literature.markOpened")}
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={() => updateProgress(100, progress?.location, true)}
            >
              {translate(locale, "literature.markComplete")}
            </button>
            {isPdfItem && (
              <>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => void download()}
                  disabled={downloadStatus === "downloading"}
                >
                  {downloadStatus === "downloading"
                    ? translate(locale, "literature.downloading")
                    : downloadStatus === "ready"
                      ? translate(locale, "literature.updateOfflinePdf")
                      : translate(locale, "literature.downloadPdf")}
                </button>
                {downloadStatus === "ready" && (
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={(event) => openReader(event.currentTarget)}
                  >
                    {translate(locale, "literature.openOffline")}
                  </button>
                )}
              </>
            )}
            {!isPdfItem && resumeScrollRatio !== undefined && (
              <button
                className="quiet-button"
                type="button"
                onClick={() => scrollDocumentToRatio(resumeScrollRatio)}
              >
                {translate(locale, "literature.returnToPosition", {
                  percent: Math.round(resumeScrollRatio * 100),
                })}
              </button>
            )}
          </div>
        </details>
        <small className="literature-progress-note">
          {progress?.location?.kind === "page" &&
            translate(locale, "literature.lastPage", {
              page: progress.location.page,
              totalPages: progress.location.totalPages,
            })}
          {progress?.lastOpenedAt
            ? ` ${translate(locale, "literature.lastOpened", {
                date: new Date(progress.lastOpenedAt).toLocaleDateString(locale),
              })}`
            : !progress?.location &&
              translate(locale, "literature.progressStored")}
        </small>
      </section>
      {readerOpen &&
        isPdfItem &&
        createPortal(
          <div
            className="literature-pdf-backdrop"
            ref={readerDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={translate(locale, "literature.pdfReaderTitle", {
              title: item.title,
            })}
            onClick={closeReader}
          >
            <section
              className="literature-pdf-overlay"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="literature-reader-panel">
                <div className="section-title-row">
                  <h2>PDF · {item.title}</h2>
                  <div className="literature-pdf-head-actions">
                    <a
                      className="text-button literature-pdf-source-link"
                      href={actualPdfUrl ?? item.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={translate(locale, "literature.officialPdf")}
                      title={translate(locale, "literature.officialPdf")}
                    >
                      <Icon name="file" size={16} />
                      <span>
                        {translate(locale, "literature.officialPdf")}
                      </span>
                    </a>
                    <button
                      className="text-button literature-pdf-close"
                      type="button"
                      onClick={closeReader}
                      aria-label={translate(locale, "literature.closeReader")}
                      title={translate(locale, "literature.closeReader")}
                    >
                      <Icon name="cross" size={16} />
                      <span>
                        {translate(locale, "literature.closeReader")}
                      </span>
                    </button>
                  </div>
                </div>
                <Suspense
                  fallback={
                    <div className="loading-panel">
                      {translate(locale, "literature.pdfViewerLoading")}
                    </div>
                  }
                >
                  <LiteraturePdfReader
                    src={pdfSourceUrl ?? item.url}
                    initialPage={resumePage}
                    locale={locale}
                    title={item.title}
                    progressKey={`literature:${item.id}:${resourceVersion}`}
                    onPageChange={onPageChange}
                  />
                </Suspense>
              </div>
            </section>
          </div>,
          document.body,
        )}
      {articleOpen && item.format === "article" && (
        <section
          className="literature-reader-panel"
          aria-label={translate(locale, "literature.articleReaderTitle", {
            title: item.title,
          })}
          data-testid="literature-article-reader"
          data-reading-location={
            resumeScrollRatio === undefined
              ? "start"
              : `${Math.round(resumeScrollRatio * 100)}%`
          }
        >
          <div className="section-title-row">
            <h2>{item.title}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => setArticleOpen(false)}
            >
              {translate(locale, "literature.closeReader")}
            </button>
          </div>
          {articleStatus === "loading" && (
            <div className="loading-panel" role="status">
              {translate(locale, "literature.articleLoading")}
            </div>
          )}
          {articleStatus === "error" && (
            <div className="error-panel" role="alert">
              <strong>{translate(locale, "literature.articleErrorTitle")}</strong>
              <span>{translate(locale, "literature.articleErrorBody")}</span>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void openArticle()}
              >
                {translate(locale, "literature.retry")}
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
