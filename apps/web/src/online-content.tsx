import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SauhPost, SuaraSejatiPost } from "@gys/contracts";
import type { Locale } from "./i18n.js";
import { fetchSauh, subscribeSauh } from "./sauh.js";
import { fetchSuara } from "./suara.js";
import { fetchOnlineArticle } from "./online-article.js";
import { recordDiagnostic } from "./diagnostics.js";

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="online-article-body">
      {text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>
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
  >({ status: "loading" });

  const load = (signal?: AbortSignal) => {
    setState({ status: "loading" });
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
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const unsubscribe = subscribeSauh((items) => {
      const [post] = items;
      if (post) setState({ status: "ready", post });
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, []);

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
        <article className="online-article-card">
          {state.post.imageUrl && (
            <img
              className="online-article-image"
              src={state.post.imageUrl}
              alt={`Ilustrasi ${state.post.title}`}
              loading="eager"
              decoding="async"
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
  >({ status: "loading" });
  const load = (signal?: AbortSignal) => {
    setState({ status: "loading" });
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
              {post.imageUrl ? (
                <img
                  src={post.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="suara-thumbnail-fallback" aria-hidden="true">
                  SS
                </span>
              )}
              <span>
                <strong>{post.title}</strong>
                <small>{post.excerpt}</small>
                <em>{new Date(post.publishedAt).toLocaleDateString()}</em>
              </span>
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
        recordDiagnostic("error", "content.article", error);
        setState({
          status: "error",
          post,
          message:
            error instanceof Error
              ? error.message
              : "Artikel belum dapat dimuat di aplikasi",
        });
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
        <article className="online-article-card">
          <p className="date-line">
            Suara Sejati ·{" "}
            {new Date(state.post.publishedAt).toLocaleDateString(locale)}
          </p>
          <h1>{state.post.title}</h1>
          {state.post.imageUrl && (
            <img
              className="online-article-image"
              src={state.post.imageUrl}
              alt={`Thumbnail ${state.post.title}`}
              loading="eager"
              decoding="async"
            />
          )}
          <Paragraphs text={state.body ?? state.post.excerpt} />
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
