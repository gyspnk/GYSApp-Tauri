/**
 * Generates rich, editorial SVG cover illustrations for Suara Sejati & Literature.
 * Ensures zero-dependency, instant, offline-ready thumbnail display with varied
 * Sanctuary Editorial palettes composed inside the shared 16:9 / 3:4 / 2:3 safe zone.
 */

export interface CoverOptions {
  title: string;
  category?: string | undefined;
  format?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

interface CategoryTheme {
  bg1: string;
  bg2: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
  icon: string;
  label: string;
}

const CROSS_MOTIF = `<path d="M100 38 v124 M68 78 h64" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`;

const KESAKSIAN_PALETTES: readonly CategoryTheme[] = [
  {
    bg1: "#0c3547",
    bg2: "#165c72",
    accent: "#67e8f9",
    badgeBg: "rgba(103, 232, 249, 0.2)",
    badgeText: "#cffafe",
    icon: CROSS_MOTIF,
    label: "KESAKSIAN",
  },
  {
    bg1: "#4a2511",
    bg2: "#8a421a",
    accent: "#fdba74",
    badgeBg: "rgba(253, 186, 116, 0.2)",
    badgeText: "#ffedd5",
    icon: CROSS_MOTIF,
    label: "KESAKSIAN",
  },
  {
    bg1: "#1a3a2f",
    bg2: "#2d604e",
    accent: "#6ee7b7",
    badgeBg: "rgba(110, 231, 183, 0.2)",
    badgeText: "#d1fae5",
    icon: CROSS_MOTIF,
    label: "KESAKSIAN",
  },
  {
    bg1: "#172554",
    bg2: "#1e40af",
    accent: "#93c5fd",
    badgeBg: "rgba(147, 197, 253, 0.22)",
    badgeText: "#dbeafe",
    icon: CROSS_MOTIF,
    label: "KESAKSIAN",
  },
  {
    bg1: "#3d2c1e",
    bg2: "#6b4c30",
    accent: "#fcd34d",
    badgeBg: "rgba(252, 211, 77, 0.2)",
    badgeText: "#fef3c7",
    icon: CROSS_MOTIF,
    label: "KESAKSIAN",
  },
  {
    bg1: "#2e1065",
    bg2: "#4c1d95",
    accent: "#c4b5fd",
    badgeBg: "rgba(196, 181, 253, 0.2)",
    badgeText: "#ede9fe",
    icon: CROSS_MOTIF,
    label: "KESAKSIAN",
  },
];

const DEFAULT_THEME: CategoryTheme = KESAKSIAN_PALETTES[0]!;

const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  warta: {
    bg1: "#0c4a6e",
    bg2: "#0369a1",
    accent: "#7dd3fc",
    badgeBg: "rgba(125, 211, 252, 0.2)",
    badgeText: "#e0f2fe",
    icon: `<path d="M62 62 h76 v76 h-76 z M76 80 h48 M76 100 h48 M76 120 h30" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>`,
    label: "WARTA",
  },
  "pelita-kecil": {
    bg1: "#58240b",
    bg2: "#9a4412",
    accent: "#fcd34d",
    badgeBg: "rgba(252, 211, 77, 0.22)",
    badgeText: "#fef3c7",
    icon: `<circle cx="100" cy="92" r="16" fill="currentColor"/><path d="M100 54 v14 M100 116 v14 M62 92 h14 M124 92 h14 M74 66 l10 10 M116 108 l10 10 M74 118 l10 -10 M116 76 l10 -10" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/>`,
    label: "PELITA KECIL",
  },
  panduan: {
    bg1: "#1e293b",
    bg2: "#334155",
    accent: "#cbd5e1",
    badgeBg: "rgba(203, 213, 225, 0.2)",
    badgeText: "#f1f5f9",
    icon: `<circle cx="100" cy="100" r="42" fill="none" stroke="currentColor" stroke-width="4.5"/><polygon points="100,72 114,114 100,104 86,114" fill="currentColor"/>`,
    label: "PANDUAN",
  },
  renungan: {
    bg1: "#064e3b",
    bg2: "#047857",
    accent: "#6ee7b7",
    badgeBg: "rgba(110, 231, 183, 0.22)",
    badgeText: "#d1fae5",
    icon: `<path d="M64 118 C78 90 95 90 100 122 C105 90 122 90 136 118" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
    label: "RENUNGAN",
  },
  buku: {
    bg1: "#3b0764",
    bg2: "#6b21a8",
    accent: "#d8b4fe",
    badgeBg: "rgba(216, 180, 254, 0.2)",
    badgeText: "#f3e8ff",
    icon: `<path d="M66 66 h34 v68 h-34 z M100 66 h34 v68 h-34 z" fill="none" stroke="currentColor" stroke-width="4.5"/>`,
    label: "BUKU",
  },
  pujian: {
    bg1: "#500724",
    bg2: "#9d174d",
    accent: "#f9a8d4",
    badgeBg: "rgba(249, 168, 212, 0.2)",
    badgeText: "#fce7f3",
    icon: `<circle cx="80" cy="118" r="13" fill="currentColor"/><circle cx="120" cy="108" r="13" fill="currentColor"/><path d="M93 118 v-52 h40 v42" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
    label: "PUJIAN",
  },
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

export function generateCoverSvg({
  title,
  category = "kesaksian",
  width = 400,
  height = 280,
}: CoverOptions): string {
  const normCat = (category || "kesaksian").toLowerCase();
  const safeTitle = title || "GYS";
  const hash = hashString(safeTitle);
  const theme =
    normCat === "kesaksian"
      ? KESAKSIAN_PALETTES[hash % KESAKSIAN_PALETTES.length]!
      : (CATEGORY_THEMES[normCat] ?? { ...DEFAULT_THEME, label: "GYS" });

  const initials = escapeXml(
    safeTitle
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
      .toUpperCase(),
  );

  const cx = width * 0.5;
  const cy = height * 0.48;
  const patternType = hash % 3;
  let patternElements = "";
  if (patternType === 0) {
    patternElements = `
      <circle cx="${cx}" cy="${cy}" r="92" fill="url(#glowGrad)" opacity="0.54"/>
      <path d="M ${cx - 72} ${height * 0.84} V ${height * 0.4} A 72 72 0 0 1 ${cx + 72} ${height * 0.4} V ${height * 0.84}" fill="none" stroke="${theme.accent}" stroke-width="1.25" opacity="0.3"/>
    `;
  } else if (patternType === 1) {
    patternElements = `
      <circle cx="${cx}" cy="${cy}" r="94" fill="url(#glowGrad)" opacity="0.56"/>
      <path d="M ${cx - 78},${height * 0.5} Q ${cx},${height * 0.3} ${cx + 78},${height * 0.5}" fill="none" stroke="${theme.accent}" stroke-width="1.35" opacity="0.28"/>
      <path d="M ${cx - 78},${height * 0.68} Q ${cx},${height * 0.82} ${cx + 78},${height * 0.64}" fill="none" stroke="${theme.accent}" stroke-width="1.15" opacity="0.2"/>
    `;
  } else {
    patternElements = `
      <circle cx="${cx}" cy="${cy}" r="92" fill="url(#glowGrad)" opacity="0.5"/>
      <circle cx="${cx}" cy="${cy}" r="62" fill="none" stroke="${theme.accent}" stroke-width="1" opacity="0.26"/>
      <rect x="${cx - 76}" y="28" width="152" height="${height - 56}" rx="12" fill="none" stroke="${theme.accent}" stroke-width="1" opacity="0.2"/>
    `;
  }

  const badgeWidth = Math.min(136, Math.max(68, theme.label.length * 7.5 + 22));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title>TJC GYS — ${theme.label}</title>
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.58"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="overlayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.52)"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  ${patternElements}

  <g transform="translate(${cx - 100}, ${cy - 100})" color="${theme.accent}" opacity="0.22">
    ${theme.icon}
  </g>

  <rect width="${width}" height="${height}" fill="url(#overlayGrad)"/>

  <rect x="${cx - badgeWidth / 2}" y="36" width="${badgeWidth}" height="22" rx="11" fill="${theme.badgeBg}" stroke="${theme.accent}" stroke-opacity="0.35" stroke-width="1"/>
  <text x="${cx}" y="50.5" fill="${theme.badgeText}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" font-weight="700" letter-spacing="0.12em" text-anchor="middle">
    ${theme.label}
  </text>

  <text x="${cx}" y="${height * 0.54}" fill="#ffffff" font-family="Georgia, 'Times New Roman', serif" font-size="28" font-weight="700" letter-spacing="0.08em" text-anchor="middle" opacity="0.92">
    ${initials}
  </text>

  <text x="${cx}" y="${height - 42}" fill="${theme.badgeText}" font-family="system-ui, -apple-system, sans-serif" font-size="9.5" font-weight="700" letter-spacing="0.14em" text-anchor="middle" opacity="0.78">
    TJC GYS
  </text>
</svg>`;
}

export function getCoverDataUri(options: CoverOptions): string {
  const svg = generateCoverSvg(options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
