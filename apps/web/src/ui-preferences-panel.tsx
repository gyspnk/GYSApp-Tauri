import {
  useEffect,
  useCallback,
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
import { useMenuPresence } from "./use-menu-presence.js";

type PreferenceOption<T extends string> = {
  value: T;
  label: string;
  sample: string;
};

const DENSITY_OPTIONS: readonly Pick<
  PreferenceOption<UiDensity>,
  "value" | "sample"
>[] = [
  { value: "comfortable", sample: "Aa+" },
  { value: "standard", sample: "Aa" },
  { value: "compact", sample: "Aa−" },
] as const;

const FONT_OPTIONS: readonly Pick<
  PreferenceOption<UiFont>,
  "value" | "sample"
>[] = [
  { value: "auto", sample: "Aa" },
  { value: "hymnal", sample: "Ag" },
  { value: "sans", sample: "Aa" },
] as const;

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
  const preferences = useSyncExternalStore(
    subscribeUiPreferences,
    getUiPreferences,
    getUiPreferences,
  );
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const present = useMenuPresence(open, layerRef);
  const close = useCallback(() => setOpen(false), []);
  const densityOptions = DENSITY_OPTIONS.map((option) => ({
    ...option,
    label: translate(locale, `more.density.${option.value}`),
  }));
  const fontOptions = FONT_OPTIONS.map((option) => ({
    ...option,
    label: translate(locale, `more.font.${option.value}`),
  }));
  useModalKeyboard(open, panelRef, openerRef, close);

  const launcher = (
    <div className="ui-preferences-entry">
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
    </div>
  );

  const dialog =
    present && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={layerRef}
            className="ui-preferences-dialog-layer"
            data-menu-open={open}
            inert={!open}
            aria-hidden={!open}
          >
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
              tabIndex={-1}
            >
              <div className="ui-preferences-header">
                <div>
                  <h2 id="ui-preferences-title">
                    {translate(locale, "more.readabilityTitle")}
                  </h2>
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
                  <h3>{translate(locale, "more.densityTitle")}</h3>
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
                  <h3>{translate(locale, "more.fontTitle")}</h3>
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
