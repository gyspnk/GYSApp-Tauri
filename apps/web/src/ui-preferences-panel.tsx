import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  getUiPreferences,
  setUiPreferences,
  subscribeUiPreferences,
  type UiDensity,
  type UiFont,
} from "./ui-preferences.js";
import { translate, type Locale } from "./i18n.js";

type PreferenceOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  sample: string;
};

const DENSITY_OPTIONS: readonly PreferenceOption<UiDensity>[] = [
  {
    value: "comfortable",
    label: "Nyaman",
    description: "Teks dan kontrol lebih lapang untuk membaca lebih lama.",
    sample: "Aa+",
  },
  {
    value: "standard",
    label: "Standar",
    description: "Seimbang untuk penggunaan sehari-hari di semua perangkat.",
    sample: "Aa",
  },
  {
    value: "compact",
    label: "Ringkas",
    description:
      "Lebih banyak konten di desktop tanpa mengecilkan target sentuh.",
    sample: "Aa−",
  },
] as const;

const FONT_OPTIONS: readonly PreferenceOption<UiFont>[] = [
  {
    value: "auto",
    label: "Otomatis",
    description: "Mengikuti tipografi utama aplikasi.",
    sample: "Aa",
  },
  {
    value: "hymnal",
    label: "Himne",
    description: "Judul bernuansa buku himne, isi tetap mudah dibaca.",
    sample: "Ag",
  },
  {
    value: "sans",
    label: "Sans modern",
    description: "Tipografi sistem yang bersih dan familier.",
    sample: "Aa",
  },
] as const;

function useAppearanceHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const findHost = () => {
      setHost(document.querySelector<HTMLElement>(".appearance-card"));
    };
    findHost();
    const observer = new MutationObserver(findHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return host;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}

function PreferenceChoice<T extends string>({
  option,
  selected,
  onSelect,
  sampleClassName,
}: {
  option: PreferenceOption<T>;
  selected: boolean;
  onSelect: (value: T) => void;
  sampleClassName?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`ui-preference-choice${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(option.value)}
    >
      <span
        className={`ui-preference-sample${sampleClassName ? ` ${sampleClassName}` : ""}`}
        aria-hidden="true"
      >
        {option.sample}
      </span>
      <span className="ui-preference-choice-copy">
        <strong>{option.label}</strong>
        <small>{option.description}</small>
      </span>
      <span className="ui-preference-check" aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}

function useModalKeyboard(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  openerRef: RefObject<HTMLButtonElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() => panel?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = focusableElements(panel);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const target = openerRef.current ?? previousFocus;
      window.requestAnimationFrame(() => target?.focus());
    };
  }, [onClose, open, openerRef, panelRef]);
}

export function UiPreferencesPanel({ locale }: { locale: Locale }) {
  const host = useAppearanceHost();
  const preferences = useSyncExternalStore(
    subscribeUiPreferences,
    getUiPreferences,
    getUiPreferences,
  );
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const close = () => setOpen(false);
  const densityOptions = DENSITY_OPTIONS.map((option) => ({
    ...option,
    label: translate(locale, `more.density.${option.value}`),
    description: translate(locale, `more.density.${option.value}Description`),
  }));
  const fontOptions = FONT_OPTIONS.map((option) => ({
    ...option,
    label: translate(locale, `more.font.${option.value}`),
    description: translate(locale, `more.font.${option.value}Description`),
  }));
  useModalKeyboard(open, panelRef, openerRef, close);

  const launcher = host
    ? createPortal(
        <div className="ui-preferences-entry">
          <div className="ui-preferences-entry-copy">
            <strong>{translate(locale, "more.readabilityTitle")}</strong>
            <small>{translate(locale, "more.readabilityDescription")}</small>
          </div>
          <button
            ref={openerRef}
            type="button"
            className="quiet-button ui-preferences-open"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="ui-preferences-open-mark" aria-hidden="true">
              Aa
            </span>
            <span>{translate(locale, "more.readabilityTitle")}</span>
          </button>
        </div>,
        host,
      )
    : null;

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div className="ui-preferences-dialog-layer">
            <button
              type="button"
              className="ui-preferences-scrim"
              aria-label={translate(locale, "more.closeAppearance")}
              onClick={close}
            />
            <section
              ref={panelRef}
              className="ui-preferences-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ui-preferences-title"
              aria-describedby="ui-preferences-description"
              tabIndex={-1}
            >
              <div className="ui-preferences-header">
                <div>
                  <p className="ui-preferences-eyebrow">
                    {translate(locale, "more.appearanceEyebrow")}
                  </p>
                  <h2 id="ui-preferences-title">
                    {translate(locale, "more.readabilityTitle")}
                  </h2>
                  <p id="ui-preferences-description">
                    {translate(locale, "more.appearanceDescription")}
                  </p>
                </div>
                <button
                  type="button"
                  className="ui-preferences-close"
                  onClick={close}
                   aria-label={translate(locale, "more.closeAppearance")}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>

              <div className="ui-preferences-section">
                <div className="ui-preferences-section-heading">
                  <div>
                        <h3>{translate(locale, "more.densityTitle")}</h3>
                        <p>{translate(locale, "more.densityDescription")}</p>
                  </div>
                  <span className="ui-preferences-current">
                    {densityOptions.find(
                      (option) => option.value === preferences.density,
                    )?.label ?? translate(locale, "more.density.standard")}
                  </span>
                </div>
                <div
                  className="ui-preference-grid"
                  role="radiogroup"
                   aria-label={translate(locale, "more.densityTitle")}
                >
                  {densityOptions.map((option) => (
                    <PreferenceChoice
                      key={option.value}
                      option={option}
                      selected={preferences.density === option.value}
                      onSelect={(density) => setUiPreferences({ density })}
                    />
                  ))}
                </div>
              </div>

              <div className="ui-preferences-section">
                <div className="ui-preferences-section-heading">
                  <div>
                        <h3>{translate(locale, "more.fontTitle")}</h3>
                        <p>{translate(locale, "more.fontDescription")}</p>
                  </div>
                  <span className="ui-preferences-current">
                    {fontOptions.find(
                      (option) => option.value === preferences.font,
                    )?.label ?? translate(locale, "more.font.auto")}
                  </span>
                </div>
                <div
                  className="ui-preference-grid"
                  role="radiogroup"
                   aria-label={translate(locale, "more.fontTitle")}
                >
                  {fontOptions.map((option) => (
                    <PreferenceChoice
                      key={option.value}
                      option={option}
                      selected={preferences.font === option.value}
                      onSelect={(font) => setUiPreferences({ font })}
                      sampleClassName={`is-${option.value}`}
                    />
                  ))}
                </div>
              </div>

              <footer className="ui-preferences-footer">
                <span>{translate(locale, "more.touchTargetHint")}</span>
                <button
                  type="button"
                  className="primary-button"
                  onClick={close}
                >
                  {translate(locale, "more.done")}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {launcher}
      {dialog}
    </>
  );
}
