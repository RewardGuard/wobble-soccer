/**
 * The 48-nation field for a 2026-style World Cup. Colours drive the kits; the
 * strength rating drives the quick-sim of matches you don't play. This is an
 * approximate field (the real qualifiers aren't all known) — tweak freely.
 */
export interface Nation {
  code: string; // 3-letter
  name: string;
  color: string; // primary kit colour
  strength: number; // ~55..92
  host?: boolean;
}

export const NATIONS: Nation[] = [
  { code: "USA", name: "United States", color: "#2f4ea0", strength: 75, host: true },
  { code: "CAN", name: "Canada", color: "#d52b1e", strength: 72, host: true },
  { code: "MEX", name: "Mexico", color: "#1f8a4c", strength: 76, host: true },

  { code: "ARG", name: "Argentina", color: "#74acdf", strength: 92 },
  { code: "FRA", name: "France", color: "#1f3aa6", strength: 91 },
  { code: "BRA", name: "Brazil", color: "#ffdf00", strength: 90 },
  { code: "ENG", name: "England", color: "#e9e9ee", strength: 89 },
  { code: "ESP", name: "Spain", color: "#d6202f", strength: 89 },
  { code: "POR", name: "Portugal", color: "#b8202e", strength: 88 },
  { code: "NED", name: "Netherlands", color: "#ff7a1a", strength: 86 },
  { code: "BEL", name: "Belgium", color: "#c8102e", strength: 84 },
  { code: "ITA", name: "Italy", color: "#1f5fd0", strength: 84 },
  { code: "GER", name: "Germany", color: "#33373d", strength: 86 },
  { code: "CRO", name: "Croatia", color: "#e23b3b", strength: 82 },
  { code: "URU", name: "Uruguay", color: "#5aa0e0", strength: 83 },
  { code: "COL", name: "Colombia", color: "#fcd116", strength: 82 },
  { code: "MAR", name: "Morocco", color: "#c1272d", strength: 81 },
  { code: "JPN", name: "Japan", color: "#1c2a6b", strength: 80 },
  { code: "SEN", name: "Senegal", color: "#15a04a", strength: 79 },
  { code: "SUI", name: "Switzerland", color: "#d52b1e", strength: 79 },
  { code: "DEN", name: "Denmark", color: "#c8102e", strength: 79 },
  { code: "KOR", name: "South Korea", color: "#d7263d", strength: 78 },
  { code: "ECU", name: "Ecuador", color: "#ffd100", strength: 77 },
  { code: "AUT", name: "Austria", color: "#ed2939", strength: 78 },
  { code: "SRB", name: "Serbia", color: "#c6363c", strength: 77 },
  { code: "UKR", name: "Ukraine", color: "#ffd500", strength: 77 },
  { code: "TUR", name: "Turkey", color: "#e30a17", strength: 77 },
  { code: "NGA", name: "Nigeria", color: "#0a8a43", strength: 76 },
  { code: "AUS", name: "Australia", color: "#ffcd00", strength: 74 },
  { code: "POL", name: "Poland", color: "#dd3b53", strength: 75 },
  { code: "EGY", name: "Egypt", color: "#cf0a2c", strength: 75 },
  { code: "NOR", name: "Norway", color: "#ba0c2f", strength: 78 },
  { code: "CIV", name: "Ivory Coast", color: "#ff8200", strength: 75 },
  { code: "PER", name: "Peru", color: "#d91023", strength: 73 },
  { code: "PAR", name: "Paraguay", color: "#d52b1e", strength: 71 },
  { code: "ALG", name: "Algeria", color: "#0a6b3a", strength: 74 },
  { code: "GHA", name: "Ghana", color: "#ce1126", strength: 73 },
  { code: "CMR", name: "Cameroon", color: "#0a8a3a", strength: 74 },
  { code: "TUN", name: "Tunisia", color: "#e70013", strength: 72 },
  { code: "IRN", name: "Iran", color: "#e31b23", strength: 75 },
  { code: "KSA", name: "Saudi Arabia", color: "#1a7a3d", strength: 71 },
  { code: "QAT", name: "Qatar", color: "#8a1538", strength: 70 },
  { code: "CRC", name: "Costa Rica", color: "#c8102e", strength: 71 },
  { code: "JAM", name: "Jamaica", color: "#ffb81c", strength: 70 },
  { code: "PAN", name: "Panama", color: "#db0a16", strength: 69 },
  { code: "IRQ", name: "Iraq", color: "#2e8b57", strength: 69 },
  { code: "NZL", name: "New Zealand", color: "#3a3f4a", strength: 66 },
  { code: "HON", name: "Honduras", color: "#1c4fb3", strength: 67 },
];

/** Make team 1's kit contrast with team 0 when their colours are too close. */
export function awayColor(home: string, away: string): string {
  if (colorDist(home, away) > 0.25) return away;
  // fall back to a clean white-ish away kit
  return colorDist(home, "#f0f0f3") > 0.25 ? "#f0f0f3" : "#1d1f24";
}

function colorDist(a: string, b: string): number {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return Math.sqrt((ca[0] - cb[0]) ** 2 + (ca[1] - cb[1]) ** 2 + (ca[2] - cb[2]) ** 2) / 441.7;
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
