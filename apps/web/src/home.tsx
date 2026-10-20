import { LoadingProgress } from "./loading-progress.js";
import { useReadinessMarker } from "./readiness.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { LiteratureItem } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import {
  fetchSauh,
  getCachedSauh,
  selectTodaySauh,
  subscribeSauh,
} from "./sauh.js";
import {
  fetchSuara,
  fetchSuaraSnapshot,
  getCachedSuara,
  subscribeSuara,
} from "./suara.js";
import {
  fetchLiteratureCatalog,
  getCachedLiteratureCatalog,
  literatureCategoryLabel,
  conciseLiteratureTitle,
  subscribeLiterature,
} from "./literature-catalog.js";
import {
  getActivity,
  subscribeActivity,
  type ActivityState,
} from "./history.js";
import { LazyImage } from "./lazy-image.js";
import { Icon } from "./icons.js";
import { recordDiagnostic } from "./diagnostics.js";

function SauhSkeleton({ locale }: { locale: Locale }) {
  return (
    <div
      className="sauh-skeleton"
      role="status"
      aria-live="polite"
      data-testid="home-sauh-skeleton"
    >
      <LoadingProgress
        label={translate(locale, "home.loadingSauh")}
        showLogo={false}
      />
    </div>
  );
}

export function HomePage({ locale }: { locale: Locale }) {
  useReadinessMarker("gys-home-ready");
  const [sauh, setSauh] = useState<Awaited<ReturnType<typeof fetchSauh>>>(
    () => {
      const cached = getCachedSauh();
      return cached ? selectTodaySauh(cached) : [];
    },
  );
  const [suara, setSuara] = useState<Awaited<ReturnType<typeof fetchSuara>>>(
    () => {
      return getCachedSuara() ?? [];
    },
  );
  const [sauhStatus, setSauhStatus] = useState<"loading" | "ready" | "error">(
    () => (sauh.length ? "ready" : "loading"),
  );
  const [suaraStatus, setSuaraStatus] = useState<"loading" | "ready" | "error">(
    () => {
      const cached = getCachedSuara();
      return cached && cached.length ? "ready" : "loading";
    },
  );
  const [activity, setActivity] = useState<ActivityState>(() => getActivity());
  useEffect(() => subscribeActivity(() => setActivity(getActivity())), []);
  useEffect(
    () =>
      subscribeSauh((items) => {
        const todays = selectTodaySauh(items);
        setSauh(todays);
        setSauhStatus(todays.length > 0 ? "ready" : "error");
      }),
    [],
  );
  // Suara Sejati & Literatur refresh incrementally: cached lists stay
  // painted while upstream additions are merged in place.
  useEffect(
    () =>
      subscribeSuara((posts) => {
        if (!posts.length) return;
        setSuara(posts);
        setSuaraStatus("ready");
      }),
    [],
  );
  useEffect(
    () =>
      subscribeLiterature((items) => {
        if (!items.length) return;
        setLiterature(items);
        setLiteratureStatus("ready");
      }),
    [],
  );
  const hasActivity = Boolean(activity.bible || activity.hymn);
  // An outdated snapshot must not trigger an endless revalidation loop
  // (forced re-fetch -> setSauh -> effect -> fetch again): throttle at most
  // one network re-check per minute.
  const lastForcedSauhAtRef = useRef(0);
  const refreshTodaySauh = useCallback(() => {
    const now = Date.now();
    if (now - lastForcedSauhAtRef.current < 60_000) return;
    lastForcedSauhAtRef.current = now;
    void fetchSauh(undefined, true)
      .then((items) => {
        if (items.length) setSauh(items);
      })
      .catch(() => undefined);
  }, []);
  const loadSauh = useCallback((signal?: AbortSignal) => {
    const cached = getCachedSauh();
    if (!cached || !selectTodaySauh(cached).length) {
      setSauh([]);
      setSauhStatus("loading");
    }
    void fetchSauh(signal)
      .then((items) => {
        if (signal?.aborted) return;
        const todays = selectTodaySauh(items);
        // Same stale-safe rule as the other shelves: an empty refresh keeps the
        // already-painted reading instead of collapsing the section.
        if (todays.length) {
          setSauh(todays);
          setSauhStatus("ready");
          return;
        }
        setSauhStatus((status) => (status === "ready" ? "ready" : "error"));
      })
      .catch(() => {
        if (!signal?.aborted) setSauhStatus("error");
      });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadSauh(controller.signal);
    return () => controller.abort();
  }, [loadSauh]);
  const loadSuara = useCallback((signal?: AbortSignal) => {
    const cached = getCachedSuara();
    if (!cached || !cached.length) setSuaraStatus("loading");
    void (async () => {
      let displayedSnapshot = false;
      try {
        const snapshot = await fetchSuaraSnapshot(signal);
        if (signal?.aborted) return;
        if (snapshot.length) {
          displayedSnapshot = true;
          setSuara(snapshot);
          setSuaraStatus("ready");
        }
      } catch {
        // Live content below remains the recovery path when the snapshot fails.
      }
      try {
        const items = await fetchSuara(signal);
        if (signal?.aborted) return;
        // Keep an already-painted shelf when a refresh returns nothing.
        if (items.length) {
          setSuara(items);
          setSuaraStatus("ready");
        } else
          setSuaraStatus((status) => (status === "ready" ? "ready" : "error"));
      } catch {
        if (!signal?.aborted && !displayedSnapshot)
          setSuaraStatus((status) => (status === "ready" ? "ready" : "error"));
      }
    })();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadSuara(controller.signal);
    return () => controller.abort();
  }, [loadSuara]);

  const [literature, setLiterature] = useState<LiteratureItem[]>(
    () => getCachedLiteratureCatalog() ?? [],
  );
  const [literatureStatus, setLiteratureStatus] = useState<
    "loading" | "ready" | "error"
  >(() => (literature.length ? "ready" : "loading"));

  const loadLiterature = useCallback((signal?: AbortSignal) => {
    if (!getCachedLiteratureCatalog()?.length) setLiteratureStatus("loading");
    void fetchLiteratureCatalog(signal)
      .then((items) => {
        if (signal?.aborted) return;
        // A refresh that comes back empty must never erase the list the reader
        // is already looking at: that collapsed the whole section mid-scroll.
        if (items.length) {
          setLiterature(items);
          setLiteratureStatus("ready");
          return;
        }
        setLiteratureStatus((status) =>
          status === "ready" ? "ready" : "error",
        );
      })
      .catch((error: unknown) => {
        if (signal?.aborted) return;
        recordDiagnostic("warn", "home.literature", error);
        setLiteratureStatus((status) =>
          status === "ready" ? "ready" : "error",
        );
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadLiterature(controller.signal);
    return () => controller.abort();
  }, [loadLiterature]);

  useEffect(() => {
    const selected = sauh[0];
    const isToday = Boolean(selected && selectTodaySauh([selected]).length);
    if (sauhStatus === "ready" && !isToday && navigator.onLine) {
      refreshTodaySauh();
    }
  }, [sauh, sauhStatus, refreshTodaySauh]);

  useEffect(() => {
    const checkFreshness = () => {
      const selected = sauh[0];
      const isToday = Boolean(selected && selectTodaySauh([selected]).length);
      if (!isToday && navigator.onLine) {
        refreshTodaySauh();
      }
    };
    window.addEventListener("focus", checkFreshness);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkFreshness();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", checkFreshness);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sauh, refreshTodaySauh]);
  const selected = sauh[0];
  const selectedToday = selectTodaySauh(sauh)[0];
  const dailyText = selectedToday
    ? (selectedToday.verse ?? selectedToday.body)
    : "";
  const today = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return (
    <div className="page home-page">
      <header className="home-welcome">
        <section className="page-intro">
          <div>
            <p className="date-line">{today}</p>
            <h1>{translate(locale, "home.title")}</h1>
          </div>
        </section>
        <nav
          className="home-portals"
          aria-label={translate(locale, "home.overview")}
        >
          {(
            [
              ["/bible", "bible"],
              ["/kidung", "kidung"],
              ["/iman", "iman"],
            ] as const
          ).map(([path, key]) => (
            <Link className="home-portal" to={path} key={path}>
              <Icon
                name={
                  key === "kidung"
                    ? "music"
                    : key === "iman"
                      ? "faith"
                      : "bible"
                }
                size={28}
              />
              <span className="portal-copy">
                <strong>{translate(locale, `nav.${key}`)}</strong>
              </span>
            </Link>
          ))}
        </nav>
      </header>
      <section
        className="home-grid"
        aria-label={translate(locale, "home.overview")}
      >
        <article className="verse-panel">
          {selectedToday && (
            <div className="sauh-card-media">
              <LazyImage
                locale={locale}
                className="sauh-image"
                wrapperClassName="sauh-image-wrap"
                src={selectedToday.imageUrl}
                fallbackTitle={selectedToday.title}
                fallbackCategoryKey="renungan"
                fallbackCategory={translate(
                  locale,
                  "literature.category.renungan",
                )}
                alt={translate(locale, "home.illustrationAlt", {
                  title: selectedToday.title,
                })}
                loading="eager"
                fetchPriority="high"
              />
              <div className="sauh-media-overlay" />
            </div>
          )}
          <div className="sauh-card-content">
            {!selectedToday && sauhStatus !== "error" && (
              <SauhSkeleton locale={locale} />
            )}
            {sauhStatus === "error" && !selectedToday && (
              <div className="sauh-offline-state">
                <strong>{translate(locale, "home.sauhUnavailable")}</strong>
                <small>{translate(locale, "home.sauhOfflineHint")}</small>
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => loadSauh()}
                >
                  {translate(locale, "home.sauhRetry")}
                </button>
              </div>
            )}
            {selectedToday && sauhStatus !== "error" && (
              <div className="sauh-card-body">
                <div className="sauh-title-row">
                  <p className="sauh-title">{selectedToday.title}</p>
                  <small className="sauh-reference">
                    {selectedToday.reference ??
                      translate(locale, "home.sauhNoReference")}
                  </small>
                </div>
                <blockquote>“{dailyText}”</blockquote>
              </div>
            )}
            {selected && (
              <div className="verse-actions">
                <Link className="quiet-button" to="/sauh">
                  {translate(locale, "home.readMore")}
                </Link>
              </div>
            )}
          </div>
        </article>
        <article className="continue-panel">
          <div className="section-heading">
            <span>{translate(locale, "home.continue")}</span>
          </div>
          {hasActivity ? (
            <div className="continue-grid">
              {activity.bible && (
                <Link className="continue-item" to="/bible">
                  <div className="item-icon">
                    <Icon name="book" size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong>
                      {activity.bible.book} {activity.bible.chapter}
                    </strong>
                    <span>{translate(locale, "home.bibleVersion")}</span>
                  </div>
                  <Icon name="arrow" size={16} />
                </Link>
              )}
              {activity.hymn && (
                <Link
                  className="continue-item"
                  to={`/kidung/${activity.hymn.id}`}
                >
                  <div className="item-icon music-icon">
                    <Icon name="music" size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <strong>{activity.hymn.title}</strong>
                    <span>
                      {translate(locale, "home.hymnLabel")} ·{" "}
                      {String(activity.hymn.number).padStart(3, "0")}
                    </span>
                  </div>
                  <Icon name="arrow" size={16} />
                </Link>
              )}
            </div>
          ) : (
            <div className="empty-inline">
              <p>{translate(locale, "home.noRecent")}</p>
              <Link className="quiet-button" to="/bible">
                <Icon name="book" size={18} />
                {translate(locale, "home.startReading")}
              </Link>
            </div>
          )}
        </article>
        <section
          className="home-media-section home-suara-section"
          aria-labelledby="home-suara-heading"
        >
          <div className="section-title-row">
            <div>
              <p className="date-line">{translate(locale, "home.testimony")}</p>
              <h2 id="home-suara-heading">
                {translate(locale, "suara.title")}
              </h2>
            </div>
            <Link className="text-button" to="/suara">
              {translate(locale, "home.viewAll")}
            </Link>
          </div>
          {suaraStatus === "loading" && (
            <div className="loading-panel" role="status">
              <LoadingProgress label={translate(locale, "home.loadingSuara")} />
            </div>
          )}
          {suaraStatus === "error" && (
            <div className="error-panel" role="alert">
              <strong>{translate(locale, "home.suaraUnavailable")}</strong>
              <button
                className="quiet-button"
                type="button"
                onClick={() => loadSuara()}
              >
                {translate(locale, "home.retry")}
              </button>
            </div>
          )}
          {suaraStatus === "ready" && (
            <div className="home-suara-shelf">
              {suara.slice(0, 8).map((post, index) => (
                <Link
                  className="suara-library-item"
                  key={post.id}
                  to={`/suara/${encodeURIComponent(post.id)}`}
                >
                  <div className="suara-card-media">
                    <LazyImage
                      locale={locale}
                      className="suara-thumb-img"
                      wrapperClassName="suara-library-thumb"
                      src={post.imageUrl}
                      fallbackTitle={post.title}
                      fallbackCategoryKey="kesaksian"
                      fallbackCategory={translate(locale, "home.testimony")}
                      alt={translate(locale, "home.coverAlt", {
                        title: post.title,
                      })}
                      loading={index < 3 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                    <div className="suara-media-overlay" />
                  </div>
                  <div className="suara-card-content">
                    <span className="suara-date">
                      {new Date(post.publishedAt).toLocaleDateString(locale, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <strong>{post.title}</strong>
                    <small>{post.excerpt}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section
          className="home-media-section home-literature-section"
          aria-labelledby="home-literature-heading"
        >
          <div className="section-title-row">
            <div>
              <p className="date-line">{translate(locale, "home.reading")}</p>
              <h2 id="home-literature-heading">
                {translate(locale, "home.literature")}
              </h2>
            </div>
            <Link className="text-button" to="/literatur">
              {translate(locale, "home.viewAll")}
            </Link>
          </div>
          {literatureStatus === "loading" && (
            <div className="loading-panel" role="status">
              <LoadingProgress
                label={translate(locale, "home.loadingLiterature")}
              />
            </div>
          )}
          {literatureStatus === "error" && (
            <div className="error-panel" role="alert">
              <strong>{translate(locale, "home.literatureUnavailable")}</strong>
              <button
                className="quiet-button"
                type="button"
                onClick={() => loadLiterature()}
              >
                {translate(locale, "home.retry")}
              </button>
            </div>
          )}
          {literatureStatus === "ready" && (
            <div className="home-suara-shelf home-literature-shelf">
              {literature.slice(0, 8).map((item, index) => (
                <Link
                  className="suara-library-item"
                  key={item.id}
                  to={`/literatur/${encodeURIComponent(item.id)}${item.format === "pdf" || item.format === "issue" ? "?read=1" : ""}`}
                >
                  <div className="suara-card-media">
                    <LazyImage
                      locale={locale}
                      className="suara-thumb-img"
                      wrapperClassName="suara-library-thumb"
                      src={item.imageUrl}
                      fallbackTitle={item.title}
                      fallbackCategoryKey={item.category}
                      fallbackCategory={literatureCategoryLabel(
                        locale,
                        item.category,
                      )}
                      alt={translate(locale, "home.coverAlt", {
                        title: item.title,
                      })}
                      loading={index < 3 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                    <div className="suara-media-overlay" />
                  </div>
                  <div className="suara-card-content">
                    <span className="suara-date">
                      {literatureCategoryLabel(locale, item.category)}
                    </span>
                    <strong>{conciseLiteratureTitle(item.title)}</strong>
                    <span className="suara-card-meta">
                      {item.publishedAt
                        ? new Date(item.publishedAt).toLocaleDateString(
                            locale,
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )
                        : translate(locale, "home.archiveTjc")}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
