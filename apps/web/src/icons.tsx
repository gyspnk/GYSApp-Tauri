import { memo, type ReactNode } from "react";

export type IconName =
  | "home"
  | "bible"
  | "music"
  | "faith"
  | "more"
  | "sun"
  | "moon"
  | "amoled"
  | "sepia"
  | "system"
  | "play"
  | "pause"
  | "stop"
  | "skipPrevious"
  | "skipNext"
  | "chevronDown"
  | "chevronUp"
  | "chevronLeft"
  | "chevronRight"
  | "volume"
  | "volumeOff"
  | "cross"
  | "checkCircle"
  | "cancel"
  | "arrow"
  | "book"
  | "search"
  | "person"
  | "columns"
  | "copy"
  | "settings"
  | "download"
  | "file"
  | "heart"
  | "playlist"
  | "bookmark"
  | "repeat"
  | "menuBook"
  | "tune"
  | "textDecrease"
  | "textIncrease"
  | "formatLineSpacing"
  | "lineWeight"
  | "south"
  | "north"
  | "playlistAdd"
  | "playlistAddCheck"
  | "musicNote"
  | "queueMusic"
  | "swapVert";

const ICON_PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20z" />
      <path d="M9 21.5v-6a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v6" />
    </>
  ),
  bible: (
    <>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h11M6 10h11M6 14h7" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  faith: (
    <>
      <path d="M12 2v20M5 8h14" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  amoled: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
    </>
  ),
  sepia: (
    <>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </>
  ),
  system: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  play: <path d="m9 5 10 7-10 7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  skipPrevious: (
    <>
      <path d="M6 5v14" />
      <path d="m18 6-8 6 8 6z" />
    </>
  ),
  skipNext: (
    <>
      <path d="M18 5v14" />
      <path d="m6 6 8 6-8 6z" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  volume: (
    <>
      <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
      <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
      <path d="m17 9 4 6M21 9l-4 6" />
    </>
  ),
  cross: <path d="M18 6 6 18M6 6l12 12" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 5-5" />
    </>
  ),
  cancel: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h11M6 10h11" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  columns: (
    <>
      <rect x="3.5" y="4" width="7.5" height="16" rx="1.5" />
      <rect x="13" y="4" width="7.5" height="16" rx="1.5" />
    </>
  ),
  copy: (
    <>
      <rect width="13" height="13" x="9" y="9" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 21V4.5A1.5 1.5 0 0 1 6 3z" />
      <path d="M14 3v5h4M9 13h6M9 17h6" />
    </>
  ),
  heart: (
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  ),
  playlist: (
    <>
      <path d="M4 6h11M4 11h11M4 16h7" />
      <path d="m17 14 4 2.5-4 2.5z" />
    </>
  ),
  bookmark: (
    <>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  menuBook: (
    <>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h11M6 10h11M6 14h7" />
    </>
  ),
  tune: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="9" cy="18" r="2" />
    </>
  ),
  textDecrease: (
    <>
      <path d="M4 20 10 4h4l6 16" />
      <path d="M7 14h10" />
      <path d="m19 7-3 3-3-3" />
    </>
  ),
  textIncrease: (
    <>
      <path d="M4 20 10 4h4l6 16" />
      <path d="M7 14h10" />
      <path d="m13 7 3 3 3-3" />
    </>
  ),
  formatLineSpacing: (
    <>
      <path d="M4 4h10M4 10h10M4 16h10" />
      <path d="M18 4v16M15.5 17.5 18 20l2.5-2.5" />
    </>
  ),
  lineWeight: (
    <>
      <path d="M4 5h16M4 9h16M4 13h16" />
      <path d="M4 17h16M4 21h16" />
    </>
  ),
  south: <path d="M12 4v16M6 14l6 6 6-6" />,
  north: <path d="M12 20V4M6 10l6-6 6 6" />,
  playlistAdd: (
    <>
      <path d="M4 6h11M4 11h11M4 16h7" />
      <path d="M18 14v6M15 17h6" />
    </>
  ),
  playlistAddCheck: (
    <>
      <path d="M4 6h11M4 11h11M4 16h7" />
      <path d="m16 15 2.2 2.2L22 13" />
    </>
  ),
  musicNote: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </>
  ),
  queueMusic: (
    <>
      <path d="M4 6h16M4 12h16M4 18h7" />
      <circle cx="18" cy="18" r="3" />
    </>
  ),
  swapVert: (
    <>
      <path d="M8 3v18M4 7l4-4 4 4M16 21V3M12 17l4 4 4-4" />
    </>
  ),
};

export const Icon = memo(function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  return <svg {...common}>{ICON_PATHS[name]}</svg>;
});
