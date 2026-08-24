import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SauhPost, SuaraSejatiPost } from "@gys/contracts";
import type { Locale } from "./i18n.js";
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

function SourceLink({ href }: { href: string }) {
  return (
    <a className="quiet-button" href={href} target="_blank" rel="noreferrer">
      Sumber resmi ↗
    </a>
  );
}

export function SauhPage() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; post: SauhPost }
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
        if (!post) throw new Error("Sauh untuk hari ini belum tersedia");
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
      if (post) setState({ status: "ready", post });
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
          ← Beranda
        </Link>
        <span>Sauh Bagi Jiwa · hari ini</span>
      </div>
      {state.status === "loading" && (
        <div className="loading-panel" role="status">
          Mengambil Sauh Bagi Jiwa…
        </div>
      )}
      {state.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>Renungan hari ini belum tersedia.</strong>
          <span>{state.message}</span>
          <button className="quiet-button" type="button" onClick={() => load()}>
            Coba lagi
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <article
          className={`online-article-card sauh-article${state.post.imageUrl ? " has-image" : ""}`}
        >
          {state.post.imageUrl && (
            <LazyImage
              className="online-article-image"
              wrapperClassName="sauh-article-image-wrap"
              src={state.post.imageUrl}
              alt={`Ilustrasi ${state.post.title}`}
              loading="eager"
            />
          )}
          <p className="date-line">Sauh Bagi Jiwa · sumber langsung TJC</p>
          <h1>{state.post.title}</h1>
          {state.post.reference && (
            <p className="online-article-reference">{state.post.reference}</p>
          )}
          {state.post.verse && <blockquote>“{state.post.verse}”</blockquote>}
          <Paragraphs text={state.post.body} />
          <div className="detail-actions">
            <SourceLink href={state.post.url} />
            <Link className="quiet-button" to="/">
              Kembali ke beranda
            </Link>
          </div>
        </article>
      )}
    </div>
  );
}

export function SuaraPage() {
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
          ← Beranda
        </Link>
        <span>Suara Sejati</span>
      </div>
      <section className="page-intro">
        <div>
          <p className="date-line">Cerita dan kesaksian</p>
          <h1>Suara Sejati</h1>
          <p className="intro-copy">
            Kesaksian nyata dari arsip resmi Gereja Yesus Sejati.
          </p>
        </div>
      </section>
      {state.status === "loading" && (
        <div className="loading-panel" role="status">
          Mengambil Suara Sejati…
        </div>
      )}
      {state.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>Suara Sejati belum tersedia.</strong>
          <span>Periksa koneksi lalu coba lagi.</span>
          <button className="quiet-button" type="button" onClick={() => load()}>
            Coba lagi
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <div className="suara-library-grid">
          {state.posts.map((post) => (
            <Link
              className="suara-library-item"
              key={post.id}
              to={`/suara/${encodeURIComponent(post.id)}`}
            >
              <div className="suara-card-media">
                {post.imageUrl ? (
                  <LazyImage
                    className="suara-thumb-img"
                    wrapperClassName="suara-library-thumb"
                    src={post.imageUrl}
                    alt={`Cover ${post.title}`}
                    loading="lazy"
                  />
                ) : (
                  <span className="suara-thumbnail-fallback" aria-hidden="true">
                    SS
                  </span>
                )}
                <div className="suara-media-overlay" />
              </div>
              <div className="suara-card-content">
                <span className="suara-date">
                  {new Date(post.publishedAt).toLocaleDateString(undefined, {
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
          ← Beranda
        </Link>
        <span>Suara Sejati</span>
      </div>
      {state.status === "loading" && (
        <div className="loading-panel" role="status">
          Membuka kesaksian…
        </div>
      )}
      {state.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>
            {state.post?.title ?? "Kesaksian belum dapat dibuka di aplikasi."}
          </strong>
          <span>{state.message}</span>
          {state.post && <Paragraphs text={state.post.excerpt} />}
          {state.post && <SourceLink href={state.post.url} />}
          <button className="quiet-button" type="button" onClick={load}>
            Coba lagi
          </button>
        </div>
      )}
      {state.status === "ready" && (
        <article className="online-article-card suara-article-card">
          <p className="date-line">
            Suara Sejati ·{" "}
            {new Date(state.post.publishedAt).toLocaleDateString(locale)}
          </p>
          <h1>{state.post.title}</h1>
          {state.post.imageUrl && (
            <LazyImage
              className="online-article-image"
              wrapperClassName="suara-article-image-wrap"
              src={state.post.imageUrl}
              alt={`Thumbnail ${state.post.title}`}
              loading="eager"
            />
          )}
          <SuaraParagraphs text={state.body ?? state.post.excerpt} />
          <div className="detail-actions">
            <SourceLink href={state.post.url} />
            <Link className="quiet-button" to="/">
              Kembali ke beranda
            </Link>
          </div>
        </article>
      )}
    </div>
  );
}
