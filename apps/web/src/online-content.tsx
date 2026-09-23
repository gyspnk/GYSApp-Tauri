import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SauhPost, SuaraSejatiPost } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import {
  fetchSauh,
  getCachedSauh,
  selectTodaySauh,
  subscribeSauh,
} from "./sauh.js";
import { fetchSuara, getCachedSuara } from "./suara.js";
import { fetchOnlineArticle } from "./online-article.js";
import { recordDiagnostic } from "./diagnostics.js";
import { LazyImage } from "./lazy-image.js";

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="online-article-body">
      {text
        .split(/\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
        ))}
    </div>
  );
}

function isSuaraByline(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 180) return false;
  if (/^["“'‘]/.test(trimmed) && /["”'’]$/.test(trimmed)) {
    return /Gereja|Sdr\.|Sdri\.|Jemaat|cabang/i.test(trimmed);
  }
  return /Gereja.*cabang|Sdr\.|Sdri\./i.test(trimmed) && trimmed.length < 140;
}

function renderSuaraInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const verseRe = /(\([^)]*\d+:\d+[^)]*\))/g;
  const parts = text.split(verseRe);
  let key = 0;
  for (const part of parts) {
    if (!part) continue;
    if (/^\([^)]*\d+:\d+[^)]*\)$/.test(part)) {
      nodes.push(
        <span key={`v-${key++}`} className="suara-verse-ref">
          {part}
        </span>,
      );
      continue;
    }
    const quoteRe = /(“[^”]*”|"[^"]*"|‘[^’]*’|'[^']*')/g;
    const quoteParts = part.split(quoteRe);
    for (const q of quoteParts) {
      if (!q) continue;
      if (/^(“[^”]*”|"[^"]*"|‘[^’]*’|'[^']*')$/.test(q)) {
        nodes.push(
          <em key={`q-${key++}`} className="suara-quote">
            {q}
          </em>,
        );
      } else {
        nodes.push(q);
      }
    }
  }
  return nodes;
}

function SuaraParagraphs({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  const first = paragraphs[0] ?? "";
  const hasByline = isSuaraByline(first);
  const bodyParas = hasByline ? paragraphs.slice(1) : paragraphs;
  return (
    <div className="online-article-body suara-article-body">
      {hasByline && (
        <p className="online-article-byline">{renderSuaraInline(first)}</p>
      )}
      {bodyParas.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 16)}`}>
          {renderSuaraInline(paragraph)}
        </p>
      ))}
    </div>
  );
}

function SourceLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a className="quiet-button" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

export function SauhPage({ locale }: { locale: Locale }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; post: SauhPost }
    | { status: "empty" }
    | { status: "error"; message: string }
  >(() => {
    const cached = getCachedSauh();
    const [post] = cached ? selectTodaySauh(cached) : [];
    return post ? { status: "ready", post } : { status: "loading" };
  });

  const load = useCallback((signal?: AbortSignal) => {
    const cached = getCachedSauh();
    const [cachedPost] = cached ? selectTodaySauh(cached) : [];
    if (!cachedPost) setState({ status: "loading" });
    void fetchSauh(signal)
      .then(([post]) => {
        if (signal?.aborted) return;
        if (!post) {
          setState({ status: "empty" });
          return;
        }
        setState({ status: "ready", post });
      })
      .catch((error: unknown) => {
        if (signal?.aborted) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Sauh Bagi Jiwa belum tersedia",
        });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const unsubscribe = subscribeSauh((items) => {
      const [post] = selectTodaySauh(items);
      setState(post ? { status: "ready", post } : { status: "empty" });
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [load]);

  return (
    <div className="page online-content-page sauh-page" data-testid="sauh-page">
      <div className="detail-back">
        <Link className="text-button" to="/">
          {translate(locale, "sauh.backHome")}
        </Link>
        <span>
          {translate(locale, "sauh.title")} · {translate(locale, "sauh.today")}
        </span>
      </div>
      <article
        className={`online-article-card sauh-article${state.status === "ready" ? " has-image" : ""}`}
        data-sauh-status={state.status}
      >
        {state.status === "loading" && (
          <div className="sauh-inline-loading" role="status" aria-live="polite">
            <span className="sauh-inline-spinner" aria-hidden="true" />
            <div>
              <strong>{translate(locale, "sauh.loadingTitle")}</strong>
              <small>{translate(locale, "sauh.loadingBody")}</small>
            </div>
          </div>
        )}
        {(state.status === "empty" || state.status === "error") && (
          <div
            className="sauh-inline-error"
            role={state.status === "error" ? "alert" : "status"}
          >
            <strong>{translate(locale, "sauh.unavailableTitle")}</strong>
            <span>{translate(locale, "sauh.unavailableBody")}</span>
            {state.status === "error" && (
              <small className="online-error-detail">
                {translate(locale, "sauh.errorDetails")}: {state.message}
              </small>
            )}
            <div className="detail-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() => load()}
              >
                {translate(locale, "sauh.retry")}
              </button>
              <a
                className="quiet-button"
                href="https://tjc.org/id/category/sauh-bagi-jiwa/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {translate(locale, "sauh.officialSource")}
              </a>
            </div>
          </div>
        )}
        {state.status === "ready" && (
          <>
            <LazyImage
              className="online-article-image"
              wrapperClassName="sauh-article-image-wrap"
              src={state.post.imageUrl}
              fallbackTitle={state.post.title}
              fallbackCategory="renungan"
              alt={translate(locale, "sauh.imageAlt", {
                title: state.post.title,
              })}
              loading="eager"
              fetchPriority="high"
            />
            <p className="date-line">
              {translate(locale, "sauh.title")} · {translate(locale, "sauh.directSource")}
            </p>
            <h1>{state.post.title}</h1>
            {state.post.reference && (
              <p className="online-article-reference">{state.post.reference}</p>
            )}
            {state.post.verse && <blockquote>“{state.post.verse}”</blockquote>}
            <Paragraphs text={state.post.body} />
            <div className="detail-actions">
              <SourceLink
                href={state.post.url}
                label={translate(locale, "sauh.officialSource")}
              />
              <Link className="quiet-button" to="/">
                {translate(locale, "sauh.backHomePlain")}
              </Link>
            </div>
          </>
        )}
      </article>
    </div>
  );
}

export function SuaraPage({ locale }: { locale: Locale }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; posts: SuaraSejatiPost[] }
    | { status: "error" }
  >(() => {
    const cached = getCachedSuara();
    return cached && cached.length
      ? { status: "ready", posts: cached }
      : { status: "loading" };
  });
  const load = (signal?: AbortSignal) => {
    const cached = getCachedSuara();
    if (!cached || !cached.length) setState({ status: "loading" });
    void fetchSuara(signal)
      .then((posts) => {
        if (!signal?.aborted) setState({ status: "ready", posts });
      })
      .catch(() => {
        if (!signal?.aborted) setState({ status: "error" });
      });
  };
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);
  return (
    <div
      className="page online-content-page suara-page"
      data-testid="suara-page"
    >
      <div className="detail-back">
        <Link className="text-button" to="/">
          {translate(locale, "suara.backHome")}
        </Link>
        <span>{translate(locale, "suara.title")}</span>
      </div>
      <section className="page-intro">
        <div>
          <p className="date-line">{translate(locale, "suara.eyebrow")}</p>
          <h1>{translate(locale, "suara.title")}</h1>
          <p className="intro-copy">{translate(locale, "suara.intro")}</p>
        </div>
      </section>
      {state.status === "loading" && (
        <div className="loading-panel" role="status">
          {translate(locale, "suara.loading")}
        </div>
      )}
      {state.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "suara.errorTitle")}</strong>
          <span>{translate(locale, "suara.errorBody")}</span>
          <button className="quiet-button" type="button" onClick={() => load()}>
            {translate(locale, "suara.retry")}
          </button>
        </div>
      )}
      {state.status === "ready" && state.posts.length === 0 && (
        <div className="empty-panel" role="status">
          <strong>{translate(locale, "suara.emptyTitle")}</strong>
          <span>{translate(locale, "suara.emptyBody")}</span>
          <button className="quiet-button" type="button" onClick={() => load()}>
            {translate(locale, "suara.retry")}
          </button>
        </div>
      )}
      {state.status === "ready" && state.posts.length > 0 && (
        <div className="suara-library-grid">
          {state.posts.map((post, index) => (
            <Link
              className="suara-library-item"
              key={post.id}
              to={`/suara/${encodeURIComponent(post.id)}`}
            >
              <div className="suara-card-media">
                <LazyImage
                  className="suara-thumb-img"
                  wrapperClassName="suara-library-thumb"
                  src={post.imageUrl}
                  fallbackTitle={post.title}
                  fallbackCategory="kesaksian"
                  alt={translate(locale, "suara.coverAlt", {
                    title: post.title,
                  })}
                  loading={index < 4 ? "eager" : "lazy"}
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
    </div>
  );
}

type SuaraState =
  | { status: "loading" }
  | { status: "ready"; post: SuaraSejatiPost; body?: string }
  | { status: "error"; post?: SuaraSejatiPost; message: string };

export function SuaraDetailPage({ locale }: { locale: Locale }) {
  const { postId } = useParams();
  const [state, setState] = useState<SuaraState>({ status: "loading" });

  const load = () => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      const posts = await fetchSuara(controller.signal);
      const post = posts.find((item) => item.id === postId);
      if (!post) throw new Error("Suara Sejati tidak ditemukan");
      try {
        const article = await fetchOnlineArticle(post.url, controller.signal);
        setState({ status: "ready", post, body: article.body });
      } catch (error) {
        if (controller.signal.aborted) return;
        recordDiagnostic("warn", "content.article", error);
        if (post.excerpt) {
          setState({ status: "ready", post, body: post.excerpt });
        } else {
          setState({
            status: "error",
            post,
            message:
              error instanceof Error
                ? error.message
                : "Artikel belum dapat dimuat di aplikasi",
          });
        }
      }
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      recordDiagnostic("error", "content.feed", error);
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Suara Sejati belum tersedia",
      });
    });
    return () => controller.abort();
  };

  useEffect(load, [postId]);

  return (
    <div
      className="page online-content-page suara-detail-page"
      data-testid="suara-detail-page"
    >
      <div className="detail-back">
        <Link className="text-button" to="/">
          {translate(locale, "suara.backHome")}
        </Link>
        <span>{translate(locale, "suara.title")}</span>
      </div>
      {state.status === "loading" && (
        <div className="loading-panel" role="status">
          {translate(locale, "suara.detailLoading")}
        </div>
      )}
      {state.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>
            {state.post?.title ?? translate(locale, "suara.detailErrorTitle")}
          </strong>
          <span>{translate(locale, "suara.detailErrorBody")}</span>
          <small className="online-error-detail">
            {translate(locale, "suara.detailErrorDetails")}: {state.message}
          </small>
          {state.post && <Paragraphs text={state.post.excerpt} />}
          {state.post && (
            <SourceLink
              href={state.post.url}
              label={translate(locale, "suara.officialSource")}
            />
          )}
          <button className="quiet-button" type="button" onClick={load}>
            {translate(locale, "suara.detailRetry")}
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <article className="online-article-card suara-article-card">
          <p className="date-line">
            {translate(locale, "suara.title")} ·{" "}
            {new Date(state.post.publishedAt).toLocaleDateString(locale)}
          </p>
          <h1>{state.post.title}</h1>
          <LazyImage
            className="online-article-image"
            wrapperClassName="suara-article-image-wrap"
            src={state.post.imageUrl}
            fallbackTitle={state.post.title}
            fallbackCategory="kesaksian"
            alt={translate(locale, "suara.detailCoverAlt", {
              title: state.post.title,
            })}
            loading="eager"
            fetchPriority="high"
          />
          <SuaraParagraphs text={state.body ?? state.post.excerpt} />
          <div className="detail-actions">
            <SourceLink
              href={state.post.url}
              label={translate(locale, "suara.officialSource")}
            />
            <Link className="quiet-button" to="/">
              {translate(locale, "suara.returnHome")}
            </Link>
          </div>
        </article>
      )}
    </div>
  );
}
