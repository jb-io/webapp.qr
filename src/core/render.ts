/**
 * Renders a module matrix and a style into a standalone SVG document. The
 * SVG is the single master: preview, fullscreen view, raster and PDF
 * exports are all derived from it, so they can never drift apart.
 *
 * Coordinates are in module units; the caller decides the pixel size.
 */
import { isDark, isFinder } from './matrix.ts';
import type { EyeShape, QrMatrix, QrStyle } from './types.ts';

export interface Layout {
  /** Total width / height in module units. */
  width: number;
  height: number;
  /** Top-left corner of the symbol (without quiet zone). */
  codeX: number;
  codeY: number;
  frameWidth: number;
  radius: number;
  fontSize: number;
  labelBand: number;
  labelY: number;
  /** Logo box in module coordinates of the symbol, or null. */
  logoBox: { start: number; size: number } | null;
}

const LABEL_SCALE = { s: 0.065, m: 0.085, l: 0.105 } as const;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Allowed logo edge length relative to the symbol width. */
export const LOGO_MIN = 0.1;
export const LOGO_MAX = 0.3;

/** Rough rendered width in em: wide glyphs (CJK, emoji) take a full em. */
export const textWidthEm = (text: string): number =>
  [...text].reduce((sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.58), 0);

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

/** XML-escapes text and drops characters XML 1.0 does not allow at all. */
export function escapeXml(value: string): string {
  return value
    // C0 controls (except tab/LF/CR) and U+FFFE/U+FFFF are invalid in XML.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Logo box aligned to the module grid so that it is exactly centred. */
export function logoBoxFor(size: number, ratio: number): { start: number; size: number } {
  let box = Math.max(3, Math.round(size * Math.min(LOGO_MAX, Math.max(LOGO_MIN, ratio))));
  if ((size - box) % 2 !== 0) box += 1;
  return { start: (size - box) / 2, size: box };
}

export function computeLayout(m: QrMatrix, s: QrStyle): Layout {
  const code = m.size + 2 * s.quietZone;
  const label = s.label.trim();
  const frameWidth = s.frame === 'none' ? 0 : Math.max(1, code * 0.035);
  const fontSize = code * LABEL_SCALE[s.labelSize];
  const labelBand = label ? fontSize * 2 : 0;
  const width = code + 2 * frameWidth;
  const height = code + labelBand + 2 * frameWidth;
  const top = s.labelPosition === 'top';
  const codeY = frameWidth + (top ? labelBand : 0) + s.quietZone;
  const labelY = top ? frameWidth + labelBand / 2 : frameWidth + code + labelBand / 2;
  const radius = s.frame === 'rounded' || s.frame === 'banner' ? code * 0.07 : 0;
  return {
    width, height, codeX: frameWidth + s.quietZone, codeY, frameWidth, radius, fontSize, labelBand, labelY,
    logoBox: s.logo ? logoBoxFor(m.size, s.logoSize) : null,
  };
}

/** Rounded rectangle as path data; `r` is clamped to half the shorter side. */
export function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;
  return `M${fmt(x + rr)} ${fmt(y)}h${fmt(w - 2 * rr)}a${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(rr)} ${fmt(rr)}`
    + `v${fmt(h - 2 * rr)}a${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(-rr)} ${fmt(rr)}`
    + `h${fmt(-(w - 2 * rr))}a${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(-rr)} ${fmt(-rr)}`
    + `v${fmt(-(h - 2 * rr))}a${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(rr)} ${fmt(-rr)}z`;
}

const circle = (cx: number, cy: number, r: number): string =>
  `M${fmt(cx - r)} ${fmt(cy)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(2 * r)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-2 * r)} 0z`;

/** Module with each outer corner rounded unless a neighbour continues it. */
function roundedModule(m: QrMatrix, row: number, col: number, x: number, y: number): string {
  const r = 0.5;
  const up = isDark(m, row - 1, col);
  const down = isDark(m, row + 1, col);
  const left = isDark(m, row, col - 1);
  const right = isDark(m, row, col + 1);
  const tl = !up && !left ? r : 0;
  const tr = !up && !right ? r : 0;
  const br = !down && !right ? r : 0;
  const bl = !down && !left ? r : 0;
  const arc = (rad: number, dx: number, dy: number) => (rad ? `a${rad} ${rad} 0 0 1 ${dx} ${dy}` : '');
  return `M${fmt(x + tl)} ${fmt(y)}h${fmt(1 - tl - tr)}${arc(tr, tr, tr)}`
    + `v${fmt(1 - tr - br)}${arc(br, -br, br)}`
    + `h${fmt(-(1 - br - bl))}${arc(bl, -bl, -bl)}`
    + `v${fmt(-(1 - bl - tl))}${arc(tl, tl, -tl)}z`;
}

function modulesPath(m: QrMatrix, s: QrStyle, ox: number, oy: number, hidden: (r: number, c: number) => boolean): string {
  const parts: string[] = [];
  for (let row = 0; row < m.size; row++) {
    let run = 0;
    for (let col = 0; col <= m.size; col++) {
      const on = col < m.size && isDark(m, row, col) && !isFinder(m.size, row, col) && !hidden(row, col);
      if (s.moduleShape === 'square') {
        if (on) {
          run++;
          continue;
        }
        if (run) parts.push(`M${fmt(ox + col - run)} ${fmt(oy + row)}h${run}v1h${-run}z`);
        run = 0;
        continue;
      }
      if (!on) continue;
      const x = ox + col;
      const y = oy + row;
      if (s.moduleShape === 'dots') parts.push(circle(x + 0.5, y + 0.5, 0.45));
      else if (s.moduleShape === 'gapped') parts.push(`M${fmt(x + 0.1)} ${fmt(y + 0.1)}h.8v.8h-.8z`);
      else parts.push(roundedModule(m, row, col, x, y));
    }
  }
  return parts.join('');
}

function eyeRing(shape: EyeShape, x: number, y: number): string {
  if (shape === 'circle') return circle(x + 3.5, y + 3.5, 3.5) + circle(x + 3.5, y + 3.5, 2.5);
  const r = shape === 'rounded' ? 2 : 0;
  return roundedRect(x, y, 7, 7, r) + roundedRect(x + 1, y + 1, 5, 5, r ? 1.2 : 0);
}

function eyeBall(shape: EyeShape, x: number, y: number): string {
  if (shape === 'circle') return circle(x + 3.5, y + 3.5, 1.5);
  return roundedRect(x + 2, y + 2, 3, 3, shape === 'rounded' ? 0.9 : 0);
}

export interface RenderResult {
  svg: string;
  layout: Layout;
}

/**
 * @param pixelWidth  value for the `width` attribute; height follows the
 *                    aspect ratio. Omit for a responsive SVG.
 */
export function renderSvg(m: QrMatrix, s: QrStyle, pixelWidth?: number): RenderResult {
  const L = computeLayout(m, s);
  const { width: W, height: H } = L;
  const ox = L.codeX;
  const oy = L.codeY;
  const fg = s.foreground;
  const bg = s.background;
  const out: string[] = [];

  const size = pixelWidth
    ? ` width="${fmt(pixelWidth)}" height="${fmt((pixelWidth * H) / W)}"`
    : '';
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(W)} ${fmt(H)}"${size} shape-rendering="geometricPrecision">`);

  if (!s.transparentBackground) out.push(`<path fill="${escapeXml(bg)}" d="${roundedRect(0, 0, W, H, L.radius)}"/>`);

  if (s.frame !== 'none') {
    const fw = L.frameWidth;
    const holeH = s.frame === 'banner' ? H - 2 * fw - L.labelBand : H - 2 * fw;
    const holeY = s.frame === 'banner' && s.labelPosition === 'top' ? fw + L.labelBand : fw;
    const inner = roundedRect(fw, holeY, W - 2 * fw, holeH, Math.max(0, L.radius - fw));
    out.push(`<path fill="${escapeXml(s.frameColor)}" fill-rule="evenodd" d="${roundedRect(0, 0, W, H, L.radius)}${inner}"/>`);
  }

  const box = L.logoBox;
  const hidden = (row: number, col: number) => Boolean(
    box && (s.logoExcavate || s.logoPlate)
      && row >= box.start && row < box.start + box.size && col >= box.start && col < box.start + box.size,
  );
  out.push(`<path fill="${escapeXml(fg)}" d="${modulesPath(m, s, ox, oy, hidden)}"/>`);

  const eye = s.eyeColor || fg;
  const corners: [number, number][] = [[0, 0], [m.size - 7, 0], [0, m.size - 7]];
  const rings = corners.map(([c, r]) => eyeRing(s.eyeFrameShape, ox + c, oy + r)).join('');
  const balls = corners.map(([c, r]) => eyeBall(s.eyeBallShape, ox + c, oy + r)).join('');
  out.push(`<path fill="${escapeXml(eye)}" fill-rule="evenodd" d="${rings}"/>`);
  out.push(`<path fill="${escapeXml(eye)}" d="${balls}"/>`);

  if (box) {
    const bx = ox + box.start;
    const by = oy + box.start;
    if (s.logoPlate) {
      out.push(`<path fill="${escapeXml(s.transparentBackground ? '#ffffff' : bg)}" d="${roundedRect(bx, by, box.size, box.size, box.size * 0.18)}"/>`);
    }
    const pad = s.logoPlate ? box.size * 0.1 : 0;
    out.push(`<image href="${escapeXml(s.logo)}" x="${fmt(bx + pad)}" y="${fmt(by + pad)}" width="${fmt(box.size - 2 * pad)}" height="${fmt(box.size - 2 * pad)}" preserveAspectRatio="xMidYMid meet"/>`);
  }

  const label = s.label.trim();
  if (label) {
    const color = s.labelColor || (s.frame === 'banner' ? bg : fg);
    const available = W - 2 * L.frameWidth - L.fontSize;
    // Rough width estimate; squeeze long labels instead of clipping them.
    const estimate = textWidthEm(label) * L.fontSize;
    const squeeze = estimate > available ? ` textLength="${fmt(available)}" lengthAdjust="spacingAndGlyphs"` : '';
    out.push(`<text x="${fmt(W / 2)}" y="${fmt(L.labelY)}" fill="${escapeXml(color)}" font-family='${FONT}' font-size="${fmt(L.fontSize)}" font-weight="600" text-anchor="middle" dominant-baseline="central"${squeeze}>${escapeXml(label)}</text>`);
  }

  out.push('</svg>');
  return { svg: out.join(''), layout: L };
}
