/** Suppress browser content actions while keeping form editing usable. */
export function installImmersiveInteractions(): () => void {
  const prevent = (event: Event) => event.preventDefault();
  const select = (event: Event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('input, textarea, [contenteditable="true"]')
    )
      return;
    event.preventDefault();
  };
  const keyboard = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "c") event.preventDefault();
    else if (key === "a") select(event);
  };
  document.addEventListener("contextmenu", prevent);
  document.addEventListener("copy", prevent);
  document.addEventListener("selectstart", select);
  document.addEventListener("dragstart", select);
  document.addEventListener("keydown", keyboard);
  return () => {
    document.removeEventListener("contextmenu", prevent);
    document.removeEventListener("copy", prevent);
    document.removeEventListener("selectstart", select);
    document.removeEventListener("dragstart", select);
    document.removeEventListener("keydown", keyboard);
  };
}
