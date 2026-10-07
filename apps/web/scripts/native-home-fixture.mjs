/** A reload-safe offline/recovery fixture, serialized into the WebView. */
export function installNativeHomeFixture(recoverySauh) {
  const key = "gys-native-home-fixture-v1";
  const state = JSON.parse(sessionStorage.getItem(key) ?? "null");
  if (!state || window.__gysNativeHomeRequests) return;
  const save = () => sessionStorage.setItem(key, JSON.stringify(state));
  if (!state.initialized) {
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = storage.length - 1; index >= 0; index--) {
        const name = storage.key(index);
        if (
          name === "gys-activity-v1" ||
          name === "gys_suara_feed_v3" ||
          name === "gys_literature_catalog_v5" ||
          name?.startsWith("gys_sauh_v2_day_")
        )
          storage.removeItem(name);
      }
    }
    state.initialized = true;
    save();
  }
  Object.defineProperties(window, {
    __gysNativeHomeRequests: { value: state.requests, configurable: true },
    __gysNativeHomeFeedsAvailable: {
      get: () => state.available,
      set: (value) => {
        state.available = value;
        save();
      },
      configurable: true,
    },
  });
  const fixtures = new Map([
    ["/offline/sauh.json", ["sauh", { items: [] }]],
    ["/offline/suara-sejati.json", ["suara", { source: "tjc.org", items: [] }]],
    [
      "/offline/literature.json",
      ["literature", { source: "tjc.org", items: [] }],
    ],
  ]);
  const nativeFetch = window.fetch.bind(window);
  window.__gysNativeHomeRestore = () => {
    window.fetch = nativeFetch;
    sessionStorage.removeItem(key);
    delete window.__gysNativeHomeRequests;
    delete window.__gysNativeHomeFeedsAvailable;
    delete window.__gysNativeHomeRestore;
  };
  window.fetch = (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href,
    );
    const fixture =
      url.origin === location.origin
        ? fixtures.get(
            url.pathname.slice(url.pathname.lastIndexOf("/offline/")),
          )
        : undefined;
    if (fixture) {
      const [name, empty] = fixture;
      state.requests[name] += 1;
      save();
      if (state.available) return nativeFetch(input, init);
      return Promise.resolve(Response.json(empty));
    }
    if (url.origin !== location.origin) {
      state.requests.publisher += 1;
      save();
      if (state.available && url.pathname.includes("/wp-json/wp/v2/posts"))
        return Promise.resolve(Response.json([recoverySauh]));
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    return nativeFetch(input, init);
  };
}
