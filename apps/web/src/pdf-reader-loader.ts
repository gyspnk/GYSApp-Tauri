import { preloadable } from "./preloadable.js";

/** One warmed implementation shared by hymns, faith and literature. */
export const PdfReader = preloadable(() =>
  import("./pdf.js").then((module) => ({ default: module.PdfReader })),
);

export function preloadPdfReader(): Promise<unknown> {
  return PdfReader.preload();
}
