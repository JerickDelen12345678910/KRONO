// src/lib/corOcrCore.js
// Phase 8 PACE 2 / 2b — the pure, platform-free pieces of the COR reading layer: the error type, file-kind
// detection, and rebuilding visual text lines from positioned text pieces (itemsToLines / textFromItems).
// Nothing here touches the browser (no canvas, Image, Worker) and nothing here imports a Vite-only module,
// so scripts/check-cor-ocr.mjs can import it in plain Node.
// src/lib/corOcr.js imports and re-exports these, so app code keeps importing from corOcr.js.

export const OCR_ERROR = {
  UNSUPPORTED_TYPE: 'unsupported-type',
  DECODE_FAILED: 'decode-failed',
  ENGINE_FAILED: 'engine-failed',
};

export class CorOcrError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CorOcrError';
    this.code = code;
  }
}

const EXT_KIND = { jpg: 'image', jpeg: 'image', png: 'image', pdf: 'pdf' };

/** Pure: file name -> 'image' | 'pdf' | null. */
export function corFileKind(file) {
  const ext = /\.([a-z0-9]+)$/i.exec(String(file?.name ?? ''))?.[1]?.toLowerCase();
  return EXT_KIND[ext] ?? null;
}

/**
 * Pure: positioned text pieces -> visual lines, top to bottom, each line left to right.
 * `items` are { str, x, y, width, height } with y growing UPWARD (PDF page space — what pdfjs `getTextContent()`
 * gives; for image/OCR boxes pass y as the negative of the box's vertical centre). A PDF stores a table's text
 * in drawing order (one column's cells, then the next), which is NOT the order a reader sees; rebuilding the
 * lines from coordinates restores the real rows. The order of `items` never matters.
 */
export function itemsToLines(items) {
  const pieces = (items ?? [])
    .filter((it) => it && typeof it.str === 'string' && it.str.trim() !== '' && Number.isFinite(it.x) && Number.isFinite(it.y))
    .map((it) => ({
      str: it.str,
      x: it.x,
      y: it.y,
      width: Number.isFinite(it.width) && it.width > 0 ? it.width : 0,
      height: Number.isFinite(it.height) && it.height > 0 ? it.height : 0,
    }));
  if (pieces.length === 0) return [];

  const heights = pieces.map((p) => p.height).filter((h) => h > 0).sort((a, b) => a - b);
  const medianHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 10;
  const tolerance = Math.max(1.5, medianHeight * 0.35);   // same line = baselines within this distance

  const lines = [];
  for (const p of [...pieces].sort((a, b) => b.y - a.y)) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - p.y) <= tolerance) line.pieces.push(p);
    else lines.push({ y: p.y, pieces: [p] });
  }

  return lines.map(({ pieces: row }) => {
    let text = '';
    let prev = null;
    for (const p of row.sort((a, b) => a.x - b.x)) {
      if (prev) {
        const gap = p.x - (prev.x + prev.width);
        const charWidth = prev.width / Math.max(prev.str.length, 1);
        // a real gap (or explicit whitespace) is a space; pieces that touch are one word split by the PDF
        if (gap > charWidth * 0.2 || /\s$/.test(prev.str) || /^\s/.test(p.str)) text += ' ';
      }
      text += p.str.trim();
      prev = p;
    }
    return text;
  });
}

/** Pure: positioned text pieces -> one text block, one visual line per row (what the COR parser reads). */
export function textFromItems(items) {
  return itemsToLines(items).join('\n');
}