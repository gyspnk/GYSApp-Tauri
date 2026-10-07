// Restore preferences before paint.
try {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem("gys-shell-settings-v1"));
  } catch {}
  const valid =
    saved?.version === 1 &&
    ["id", "en", "zh"].includes(saved.locale) &&
    ["light", "dark", "system", "amoled", "sepia"].includes(saved.theme);
  const theme = valid ? saved.theme : localStorage.getItem("gys-theme");
  if (["light", "dark", "system", "amoled", "sepia"].includes(theme))
    document.documentElement.dataset.theme = theme;
  if (valid) document.documentElement.lang = saved.locale;
} catch {
  /* Storage is optional. */
}
