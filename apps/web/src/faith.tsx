import { useEffect, useMemo, useState } from "react";
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
  const [pack, setPack] = useState<FaithPack | undefined>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("1");
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
          <div className="faith-rows">
            {filtered.map((item) => {
              const isActive = item.number === active.number;
              return (
                <article
                  className={`faith-row${isActive ? " is-selected" : ""}`}
                  key={item.number}
                >
                  <button
                    className="faith-row-heading"
                    type="button"
                    onClick={() => setSelected(item.number)}
                    aria-expanded={isActive}
                  >
                    <span className="faith-number">
                      {item.number.padStart(2, "0")}
                    </span>
                    <strong>{item.text.split(/[.!?]/)[0]}</strong>
                    <span aria-hidden="true">{isActive ? "−" : "+"}</span>
                  </button>
                  {isActive && (
                    <div className="faith-row-body">
                      <p className="faith-copy">{item.text}</p>
                      <div className="faith-actions">
                        <button
                          className="quiet-button"
                          type="button"
                          onClick={share}
                        >
                          Salin / bagikan
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => {
                            localStorage.setItem(
                              `gys-faith-note-${active.number}`,
                              note,
                            );
                            flash("Catatan disimpan di perangkat ini.");
                          }}
                        >
                          Simpan catatan
                        </button>
                      </div>
                      <label className="faith-note">
                        <span>Catatan pribadi</span>
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Tambahkan refleksi…"
                          rows={3}
                        />
                      </label>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
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
