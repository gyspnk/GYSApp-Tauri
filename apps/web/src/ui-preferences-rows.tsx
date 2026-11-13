import { useSyncExternalStore } from "react";
import {
  getUiPreferences,
  setUiPreferences,
  subscribeUiPreferences,
  type UiDensity,
  type UiFont,
} from "./ui-preferences.js";
import { translate, type Locale } from "./i18n.js";
import { Select } from "./select.js";

const DENSITIES = [
  "comfortable",
  "standard",
  "compact",
] as const satisfies readonly UiDensity[];
const FONTS = ["auto", "hymnal", "sans"] as const satisfies readonly UiFont[];

/** Density and font are two rows in the appearance group, exactly like the
 * screen theme and the accent: same label column, same select control, no
 * second surface to open. The old modal sheet made the same choice look like a
 * different kind of setting. */
export function UiPreferencesRows({ locale }: { locale: Locale }) {
  const preferences = useSyncExternalStore(
    subscribeUiPreferences,
    getUiPreferences,
    getUiPreferences,
  );
  return (
    <>
      <div className="appearance-setting-row">
        <span className="appearance-setting-name">
          {translate(locale, "more.densityTitle")}
        </span>
        <Select
          className="appearance-setting-select"
          value={preferences.density}
          onChange={(density) => setUiPreferences({ density })}
          label={translate(locale, "more.densityTitle")}
          options={DENSITIES.map((value) => ({
            value,
            label: translate(locale, `more.density.${value}`),
          }))}
        />
      </div>
      <div className="appearance-setting-row">
        <span className="appearance-setting-name">
          {translate(locale, "more.fontTitle")}
        </span>
        <Select
          className="appearance-setting-select"
          value={preferences.font}
          onChange={(font) => setUiPreferences({ font })}
          label={translate(locale, "more.fontTitle")}
          options={FONTS.map((value) => ({
            value,
            label: translate(locale, `more.font.${value}`),
          }))}
        />
      </div>
    </>
  );
}
