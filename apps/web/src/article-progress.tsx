import { useCallback, useEffect, useRef, useState } from "react";
import { useMenuPresence } from "./use-menu-presence.js";
import { Icon } from "./icons.js";
import { translate, type Locale } from "./i18n.js";
import {
  readLiteratureProgress,
  saveLiteratureProgress,
} from "./literature-progress.js";

/** Last position is a bookmark; maximum progress never decreases on rereads. */
export function ArticleProgress({
  id,
  resourceVersion,
  locale,
  ready = true,
}: {
  id: string;
  resourceVersion: string;
  locale: Locale;
  ready?: boolean;
}) {
  const [saved, setSaved] = useState(() => {
    const entry = readLiteratureProgress()[id];
    return entry?.resourceVersion === resourceVersion ||
      entry?.resourceVersion === "legacy"
      ? entry
      : undefined;
  });
  const savedRef = useRef(saved);
  const [resume, setResume] = useState(() => saved);
  const [choicesOpen, setChoicesOpen] = useState(Boolean(saved?.location));
  const choicesRef = useRef<HTMLDivElement>(null);
  const choicesPresent = useMenuPresence(choicesOpen, choicesRef);
  const savePosition = useCallback(
    (ratio: number) => {
      const now = new Date().toISOString();
      const stored = saveLiteratureProgress(id, {
        ...savedRef.current,
        version: 2,
        resourceVersion,
        percent: Math.round(ratio * 100),
        location: { kind: "scroll", ratio },
        updatedAt: now,
        lastOpenedAt: now,
        ...(ratio >= 0.98 ? { completed: true } : {}),
      });
      savedRef.current = stored;
      setSaved(stored);
    },
    [id, resourceVersion],
  );
  const choose = (ratio: number) => {
    if (!ready) return;
    setChoicesOpen(false);
    window.scrollTo({
      top:
        ratio *
        Math.max(0, document.documentElement.scrollHeight - innerHeight),
      behavior: "instant",
    });
    savePosition(ratio);
  };
  useEffect(() => {
    if (!ready) return;
    const now = new Date().toISOString();
    const opened = saveLiteratureProgress(id, {
      ...savedRef.current,
      version: 2,
      resourceVersion,
      percent: savedRef.current?.percent ?? 0,
      updatedAt: savedRef.current?.updatedAt ?? now,
      lastOpenedAt: now,
    });
    savedRef.current = opened;
    setSaved(opened);
    let timer: number | undefined;
    let latestRatio: number | undefined;
    const save = () => {
      timer = undefined;
      if (latestRatio === undefined) return;
      savePosition(latestRatio);
      latestRatio = undefined;
    };
    const scroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      latestRatio = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      timer ??= window.setTimeout(save, 200);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      if (timer !== undefined) clearTimeout(timer);
      // Flush the captured position, before the next route changes geometry.
      save();
    };
  }, [id, resourceVersion, ready, savePosition]);
  const last = resume?.location?.kind === "scroll" ? resume.location.ratio : 0;
  const furthest =
    resume?.furthestLocation?.kind === "scroll"
      ? resume.furthestLocation.ratio
      : last;
  const percent = saved?.percent ?? 0;
  return (
    <div className="article-progress-strip">
      <div className="article-progress-main">
        <Icon name="book" size={16} />
        <progress
          value={percent}
          max={100}
          aria-label={translate(locale, "literature.progressAriaDetail", {
            percent,
          })}
        />
        <output>{percent}%</output>
        <button
          className="article-resume-toggle"
          type="button"
          aria-expanded={choicesOpen}
          aria-label={translate(locale, "article.positions")}
          title={translate(locale, "article.positions")}
          onClick={() => {
            setResume(savedRef.current);
            setChoicesOpen((value) => !value);
          }}
        >
          <Icon name="bookmark" size={16} />
        </button>
      </div>
      {choicesPresent && (
        <div
          ref={choicesRef}
          className="article-resume-options"
          data-menu-open={choicesOpen}
          inert={!choicesOpen}
          aria-hidden={!choicesOpen}
          aria-label={translate(locale, "article.positions")}
        >
          <button type="button" disabled={!ready} onClick={() => choose(last)}>
            {translate(locale, "article.lastPosition", {
              percent: Math.round(last * 100),
            })}
          </button>
          {furthest > last + 0.005 && (
            <button
              type="button"
              disabled={!ready}
              onClick={() => choose(furthest)}
            >
              {translate(locale, "article.furthestPosition", {
                percent: Math.round(furthest * 100),
              })}
            </button>
          )}
          <button type="button" disabled={!ready} onClick={() => choose(0)}>
            {translate(locale, "article.fromStart")}
          </button>
        </div>
      )}
    </div>
  );
}
