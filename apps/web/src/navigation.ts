export type Destination = {
  path: string;
  labelKey: string;
  descriptionKey: string;
  icon: "home" | "bible" | "music" | "faith" | "more";
};

export const DESTINATIONS: readonly Destination[] = [
  {
    path: "/",
    labelKey: "nav.home",
    descriptionKey: "nav.homeDescription",
    icon: "home",
  },
  {
    path: "/bible",
    labelKey: "nav.bible",
    descriptionKey: "nav.bibleDescription",
    icon: "bible",
  },
  {
    path: "/kidung",
    labelKey: "nav.kidung",
    descriptionKey: "nav.kidungDescription",
    icon: "music",
  },
  {
    path: "/iman",
    labelKey: "nav.iman",
    descriptionKey: "nav.imanDescription",
    icon: "faith",
  },
  {
    path: "/lainnya",
    labelKey: "nav.more",
    descriptionKey: "nav.moreDescription",
    icon: "more",
  },
];
