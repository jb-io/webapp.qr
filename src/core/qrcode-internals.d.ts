// Minimal typings for the internal modules of the `qrcode` package that we
// use to compute capacity figures. They are plain CommonJS files without
// bundled types.
declare module 'qrcode/lib/core/utils.js' {
  const utils: { getSymbolTotalCodewords(version: number): number };
  export default utils;
}
declare module 'qrcode/lib/core/error-correction-code.js' {
  const ecc: {
    getTotalCodewordsCount(version: number, level: { bit: number }): number;
    getBlocksCount(version: number, level: { bit: number }): number;
  };
  export default ecc;
}
declare module 'qrcode/lib/core/mode.js' {
  const mode: { getCharCountIndicator(mode: { id: string }, version: number): number };
  export default mode;
}
