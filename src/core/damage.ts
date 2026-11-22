/**
 * How much of the error-correction budget does a centred logo consume?
 *
 * Area is a poor proxy: a logo cuts many codewords only partially and the
 * damage is spread unevenly over the Reed-Solomon blocks. This module maps
 * every module to its codeword (ISO/IEC 18004 §7.7.3 placement, §7.6
 * interleaving) and reports the worst block - a code is only readable if
 * every block stays within its correction capacity.
 */
import type { QrMatrix } from './types.ts';

/** Misdecode-protection codewords that reduce the correctable errors (ISO 18004 Table 9). */
const PROTECTION: Record<string, number> = { '1L': 3, '1M': 2, '1Q': 1, '1H': 1, '2L': 2, '3L': 1 };

/** For every data module (row-major index) the index of its codeword in transmission order; -1 otherwise. */
export function codewordMap(m: QrMatrix): Int32Array {
  const n = m.size;
  const map = new Int32Array(n * n).fill(-1);
  let bit = 0;
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // vertical timing pattern
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i;
      for (const col of [right, right - 1]) {
        const idx = row * n + col;
        if (m.reserved[idx]) continue;
        const cw = bit >> 3;
        // Remainder bits after the last codeword stay -1.
        if (cw < m.totalCodewords) map[idx] = cw;
        bit++;
      }
    }
    upward = !upward;
  }
  return map;
}

/** Block index of each codeword in transmission order (data interleaved, then EC interleaved). */
export function codewordBlocks(m: QrMatrix): { blockOf: Int32Array; ecPerBlock: number } {
  const blocks = m.ecBlocks;
  const ecPerBlock = m.ecCodewords / blocks;
  const longBlocks = m.totalCodewords % blocks;
  const shortData = Math.floor(m.totalCodewords / blocks) - ecPerBlock;
  const dataLen = (b: number) => shortData + (b >= blocks - longBlocks ? 1 : 0);
  const blockOf = new Int32Array(m.totalCodewords);
  let k = 0;
  for (let i = 0; i < shortData + 1; i++) {
    for (let b = 0; b < blocks; b++) if (i < dataLen(b)) blockOf[k++] = b;
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < blocks; b++) blockOf[k++] = b;
  }
  return { blockOf, ecPerBlock };
}

export interface Damage {
  /** Damaged codewords in the worst block / correctable errors of a block (0..∞; > 1 = unreadable). */
  worstBlockLoad: number;
  damagedCodewords: number;
  correctablePerBlock: number;
  /** Function modules other than finders under the covered area (alignment, timing, version info). */
  functionModulesCovered: number;
}

/** Damage caused by hiding all modules in `covered(row, col)`. */
export function coverageDamage(m: QrMatrix, covered: (row: number, col: number) => boolean): Damage {
  const map = codewordMap(m);
  const { blockOf, ecPerBlock } = codewordBlocks(m);
  const hit = new Set<number>();
  let functionModulesCovered = 0;
  for (let row = 0; row < m.size; row++) {
    for (let col = 0; col < m.size; col++) {
      if (!covered(row, col)) continue;
      const idx = row * m.size + col;
      const cw = map[idx] ?? -1;
      if (cw >= 0) hit.add(cw);
      else if (m.reserved[idx]) functionModulesCovered++;
    }
  }
  const perBlock = new Array<number>(m.ecBlocks).fill(0);
  for (const cw of hit) {
    const b = blockOf[cw] ?? 0;
    perBlock[b] = (perBlock[b] ?? 0) + 1;
  }
  const correctable = Math.floor((ecPerBlock - (PROTECTION[`${m.version}${m.ecLevel}`] ?? 0)) / 2);
  const worst = Math.max(0, ...perBlock);
  return {
    worstBlockLoad: correctable > 0 ? worst / correctable : worst > 0 ? Infinity : 0,
    damagedCodewords: hit.size,
    correctablePerBlock: correctable,
    functionModulesCovered,
  };
}
