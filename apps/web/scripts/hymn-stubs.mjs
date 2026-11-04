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

// Literature articles carry their source URL inside the id (encoded `2F`
// separators), so each id is a single safe path segment.
export function literatureStubPaths(catalog) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  return items
    .map((item) => (typeof item?.id === "string" ? item.id : ""))
    .filter((id) => /^[A-Za-z0-9._-]+$/.test(id))
    .map((id) => `literatur/${id}`);
}
