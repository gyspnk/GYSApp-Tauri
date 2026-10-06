import { preloadable } from "./preloadable.js";

export const HomePage = preloadable(() =>
  import("./home.js").then((m) => ({ default: m.HomePage })),
);
export const BiblePage = preloadable(() =>
  import("./bible.js").then((m) => ({ default: m.BiblePage })),
);
export const BibleHeader = preloadable(() =>
  import("./bible-header.js").then((m) => ({ default: m.BibleHeader })),
);
export const KidungPage = preloadable(() =>
  import("./kidung-page.js").then((m) => ({ default: m.KidungPage })),
);
export const FaithPage = preloadable(() =>
  import("./faith.js").then((m) => ({ default: m.FaithPage })),
);
export const MorePage = preloadable(() =>
  import("./more.js").then((m) => ({ default: m.MorePage })),
);
export const LiteraturePage = preloadable(() =>
  import("./literature.js").then((m) => ({ default: m.LiteraturePage })),
);
export const LiteratureDetailPage = preloadable(() =>
  import("./literature.js").then((m) => ({ default: m.LiteratureDetailPage })),
);
export const SauhPage = preloadable(() =>
  import("./online-content.js").then((m) => ({ default: m.SauhPage })),
);
export const SuaraPage = preloadable(() =>
  import("./online-content.js").then((m) => ({ default: m.SuaraPage })),
);
export const SuaraDetailPage = preloadable(() =>
  import("./online-content.js").then((m) => ({ default: m.SuaraDetailPage })),
);

export const routeModules = {
  home: HomePage.preload,
  bible: () => Promise.all([BiblePage.preload(), BibleHeader.preload()]),
  kidung: KidungPage.preload,
  faith: FaithPage.preload,
  more: MorePage.preload,
  literature: () =>
    Promise.all([LiteraturePage.preload(), LiteratureDetailPage.preload()]),
  articles: () =>
    Promise.all([
      SauhPage.preload(),
      SuaraPage.preload(),
      SuaraDetailPage.preload(),
    ]),
};
