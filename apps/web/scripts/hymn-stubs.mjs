// Reader URLs are the ones people share, and GitHub Pages answers unknown
// paths with 404.html even though the shell boots. Turn every catalogue hymn
// into a directory stub so /kidung/hymn-001 answers 200 like /kidung does.
export function hymnStubPaths(catalog) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  return items
    .map((item) => (typeof item?.id === "string" ? item.id : ""))
    .filter((id) => /^hymn-[0-9]{3}[A-Z]?$/.test(id))
    .map((id) => `kidung/${id}`);
}
