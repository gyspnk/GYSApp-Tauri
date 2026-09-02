/**
 * Generates rich, elegant SVG cover illustrations for Suara Sejati & Literature.
 * Ensures zero-dependency, instant, offline-ready thumbnail display with crisp
 * typography, sacred motifs, and category-coordinated color palettes.
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

const DEFAULT_THEME: CategoryTheme = {
  bg1: "#0f172a",
  bg2: "#1e3a8a",
  accent: "#60a5fa",
  badgeBg: "rgba(59, 130, 246, 0.25)",
  badgeText: "#93c5fd",
  icon: `<path d="M100 35 v130 M65 75 h70" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
  label: "KESAKSIAN",
};

const CATEGORY_THEMES: Record<string, CategoryTheme> = {
  kesaksian: DEFAULT_THEME,
  warta: {
    bg1: "#0c4a6e",
    bg2: "#075985",
    accent: "#38bdf8",
    badgeBg: "rgba(14, 165, 233, 0.25)",
    badgeText: "#7dd3fc",
    icon: `<path d="M60 60 h80 v80 h-80 z M75 80 h50 M75 100 h50 M75 120 h30" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
    label: "WARTA",
  },
  "pelita-kecil": {
    bg1: "#451a03",
    bg2: "#78350f",
    accent: "#fbbf24",
    badgeBg: "rgba(245, 158, 11, 0.25)",
    badgeText: "#fde68a",
    icon: `<circle cx="100" cy="90" r="16" fill="currentColor"/><path d="M100 50 v15 M100 115 v15 M60 90 h15 M125 90 h15 M72 62 l10 10 M118 108 l10 10 M72 118 l10 -10 M118 72 l10 -10" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
    label: "PELITA KECIL",
  },
  panduan: {
    bg1: "#1e293b",
    bg2: "#334155",
    accent: "#94a3b8",
    badgeBg: "rgba(148, 163, 184, 0.25)",
    badgeText: "#cbd5e1",
    icon: `<circle cx="100" cy="100" r="45" fill="none" stroke="currentColor" stroke-width="5"/><polygon points="100,70 115,115 100,105 85,115" fill="currentColor"/>`,
    label: "PANDUAN",
  },
  renungan: {
    bg1: "#064e3b",
    bg2: "#047857",
    accent: "#34d399",
    badgeBg: "rgba(16, 185, 129, 0.25)",
    badgeText: "#a7f3d0",
    icon: `<path d="M60 120 C75 90 95 90 100 125 C105 90 125 90 140 120" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
    label: "RENUNGAN",
  },
  buku: {
    bg1: "#3b0764",
    bg2: "#581c87",
    accent: "#c084fc",
    badgeBg: "rgba(168, 85, 247, 0.25)",
    badgeText: "#e9d5ff",
    icon: `<path d="M65 65 h35 v70 h-35 z M100 65 h35 v70 h-35 z" fill="none" stroke="currentColor" stroke-width="5"/>`,
    label: "BUKU",
  },
  pujian: {
    bg1: "#500724",
    bg2: "#831843",
    accent: "#f472b6",
    badgeBg: "rgba(236, 72, 153, 0.25)",
    badgeText: "#fbcfe8",
    icon: `<circle cx="80" cy="120" r="14" fill="currentColor"/><circle cx="120" cy="110" r="14" fill="currentColor"/><path d="M94 120 v-55 h40 v45" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>`,
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

export function generateCoverSvg({
  title,
  category = "kesaksian",
  width = 400,
  height = 280,
}: CoverOptions): string {
  const normCat = (category || "kesaksian").toLowerCase();
  const theme = CATEGORY_THEMES[normCat] ?? DEFAULT_THEME;
  const hash = hashString(title || "GYS");

  const initials = (title || "GYS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // Pattern variant based on title hash
  const patternType = hash % 3;
  let patternElements = "";
  if (patternType === 0) {
    patternElements = `
      <circle cx="${(hash % 120) + 40}" cy="${(hash % 80) + 40}" r="90" fill="url(#glowGrad)" opacity="0.45"/>
      <circle cx="${width - 60}" cy="${height - 60}" r="110" fill="url(#glowGrad)" opacity="0.3"/>
    `;
  } else if (patternType === 1) {
    patternElements = `
      <path d="M -20,${height * 0.4} Q ${width * 0.5},${height * 0.1} ${width + 20},${height * 0.45}" fill="none" stroke="${theme.accent}" stroke-width="2" opacity="0.25"/>
      <path d="M -20,${height * 0.6} Q ${width * 0.5},${height * 0.85} ${width + 20},${height * 0.55}" fill="none" stroke="${theme.accent}" stroke-width="3" opacity="0.3"/>
      <circle cx="${width * 0.5}" cy="${height * 0.45}" r="80" fill="url(#glowGrad)" opacity="0.4"/>
    `;
  } else {
    patternElements = `
      <rect x="${width * 0.1}" y="${height * 0.15}" width="${width * 0.8}" height="${height * 0.7}" rx="16" fill="none" stroke="${theme.accent}" stroke-width="1.5" stroke-dasharray="6,6" opacity="0.25"/>
      <circle cx="${width * 0.5}" cy="${height * 0.5}" r="70" fill="url(#glowGrad)" opacity="0.4"/>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>
    <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="overlayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(0,0,0,0.1)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.65)"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
  
  <!-- Subtle Grid Lines -->
  <g opacity="0.07" stroke="#ffffff" stroke-width="1">
    <line x1="0" y1="${height * 0.33}" x2="${width}" y2="${height * 0.33}"/>
    <line x1="0" y1="${height * 0.66}" x2="${width}" y2="${height * 0.66}"/>
    <line x1="${width * 0.33}" y1="0" x2="${width * 0.33}" y2="${height}"/>
    <line x1="${width * 0.66}" y1="0" x2="${width * 0.66}" y2="${height}"/>
  </g>

  <!-- Dynamic Abstract Artwork -->
  ${patternElements}

  <!-- Motif Watermark Icon -->
  <g transform="translate(${width * 0.5 - 100}, ${height * 0.42 - 100}) scale(1)" color="${theme.accent}" opacity="0.32">
    ${theme.icon}
  </g>

  <!-- Gradient Overlay for readability -->
  <rect width="${width}" height="${height}" fill="url(#overlayGrad)"/>

  <!-- Category Badge -->
  <rect x="18" y="18" width="${theme.label.length * 8 + 24}" height="24" rx="12" fill="${theme.badgeBg}" stroke="${theme.accent}" stroke-width="1" opacity="0.9"/>
  <text x="${18 + (theme.label.length * 8 + 24) / 2}" y="34" fill="${theme.badgeText}" font-family="system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="800" letter-spacing="0.08em" text-anchor="middle">
    ${theme.label}
  </text>

  <!-- Initials Crest in Center -->
  <circle cx="${width * 0.5}" cy="${height * 0.48}" r="32" fill="rgba(255,255,255,0.08)" stroke="${theme.accent}" stroke-width="1.5" opacity="0.7"/>
  <text x="${width * 0.5}" y="${height * 0.48 + 8}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="900" letter-spacing="0.1em" text-anchor="middle" opacity="0.95">
    ${initials}
  </text>

  <!-- Brand Subtext -->
  <text x="${width - 18}" y="34" fill="rgba(255,255,255,0.45)" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="600" text-anchor="end" letter-spacing="0.06em">
    TJC GYS
  </text>
</svg>`;
}

export function getCoverDataUri(options: CoverOptions): string {
  const svg = generateCoverSvg(options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
