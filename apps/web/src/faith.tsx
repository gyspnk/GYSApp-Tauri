import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";

type FaithItem = { number: string; text: string };
type FaithGroup = { language: string; title: string; content: FaithItem[] };
type FaithPack = { faith: FaithGroup[] };

function isFaithPack(value: unknown): value is FaithPack {
  if (!value || typeof value !== "object") return false;
  const faith = (value as { faith?: unknown }).faith;
  return (
    Array.isArray(faith) &&
    faith.length > 0 &&
    faith.every(
      (group) =>
        group &&
        typeof group === "object" &&
        typeof (group as { language?: unknown }).language === "string" &&
        Array.isArray((group as { content?: unknown }).content),
    )
  );
}

export function FaithPage({ locale }: { locale: Locale }) {
  const [searchParams] = useSearchParams();
  const [pack, setPack] = useState<FaithPack | undefined>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    () => searchParams.get("item") ?? "1",
  );
  const [note, setNote] = useState(
    () => localStorage.getItem("gys-faith-note-1") ?? "",
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}offline/faith.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Faith pack unavailable");
        const json: unknown = await response.json();
        if (!isFaithPack(json)) throw new Error("Faith pack is invalid");
        setPack(json);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPack({ faith: [] });
      });
    return () => controller.abort();
  }, []);

  const group =
    pack?.faith.find(
      (candidate) => candidate.language === locale.toUpperCase(),
    ) ?? pack?.faith[0];
  const items = group?.content ?? [];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return items.filter(
      (item) =>
        !normalized ||
        `${item.number} ${item.text}`.toLocaleLowerCase().includes(normalized),
    );
  }, [items, query]);
  const active = items.find((item) => item.number === selected) ?? items[0];

  useEffect(() => {
    if (active) {
      setSelected(active.number);
      setNote(localStorage.getItem(`gys-faith-note-${active.number}`) ?? "");
    }
  }, [active]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };
  const share = async () => {
    if (!active) return;
    const title = group?.title ?? "Iman";
    const text = `${title} ${active.number}\n${active.text}`;
    try {
      if (navigator.share) await navigator.share({ title, text });
      else {
        await navigator.clipboard?.writeText(text);
        flash("Pokok iman disalin untuk dibagikan.");
      }
    } catch {
      flash("Berbagi dibatalkan.");
    }
  };
  const copySection = async () => {
    if (!active) return;
    await navigator.clipboard?.writeText(
      `${group?.title ?? "Iman"} ${active.number}\n${active.text}`,
    );
    flash("Bagian pokok iman disalin.");
  };

  return (
    <div className="page faith-page">
      <section className="page-intro">
        <div>
          <p className="date-line">10 topics · offline pack</p>
          <h1>{translate(locale, "page.imanTitle")}</h1>
          <p className="intro-copy">{translate(locale, "page.imanBody")}</p>
        </div>
        <span className="pack-badge">ID · EN · 中文</span>
      </section>
      {!pack && (
        <div className="loading-panel" role="status">
          Membuka pokok iman offline…
        </div>
      )}
      {pack && !group && (
        <div className="error-panel" role="alert">
          Pokok iman belum tersedia.
        </div>
      )}
      {group && active && (
        <section className="faith-stack" aria-label={group.title}>
          <div className="faith-stack-toolbar">
            <label htmlFor="faith-query">Cari pokok iman</label>
            <input
              id="faith-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nomor atau kata…"
            />
            <span>{filtered.length} pokok</span>
          </div>
          <div
            className="faith-rows"
            role="list"
            aria-label="Daftar dasar kepercayaan"
          >
            {filtered.map((item) => {
              const isActive = item.number === active.number;
              return (
                <div role="listitem" key={item.number}>
                  <button
                    className={`faith-row-heading${isActive ? " is-selected" : ""}`}
                    type="button"
                    onClick={() => setSelected(item.number)}
                    aria-pressed={isActive}
                  >
                    <span className="faith-number">
                      {item.number.padStart(2, "0")}
                    </span>
                    <strong>{item.text.split(/[.!?]/)[0]}</strong>
                    <span aria-hidden="true">{isActive ? "•" : "›"}</span>
                  </button>
                </div>
              );
            })}
          </div>
          <section
            className="faith-selection"
            aria-label={`Pokok ${active.number}`}
          >
            <div className="faith-selection-toolbar">
              <span>Pokok {active.number}</span>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void copySection()}
              >
                Salin bagian
              </button>
              <button className="quiet-button" type="button" onClick={share}>
                Salin / bagikan
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  localStorage.setItem(`gys-faith-note-${active.number}`, note);
                  flash("Catatan disimpan di perangkat ini.");
                }}
              >
                Simpan catatan
              </button>
            </div>
            <p className="faith-copy">{active.text}</p>
            <label className="faith-note">
              <span>Catatan pribadi</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Tambahkan refleksi…"
                rows={3}
              />
            </label>
          </section>
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
