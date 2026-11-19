// src/lib/corOcr.js
// Phase 8 PACE 2 — wires real OCR into the parsing core built in PACE 1 (src/lib/corParser.js).
// Tesseract.js (text recognition) and pdfjs-dist (PDF page -> image, needed because Tesseract
// can't read a PDF directly) both need a real browser: canvas, Image, a Worker. This file also uses
// Vite's `?url` import, so it can NOT be imported from a Node check script. The pure pieces
// (OCR_ERROR, CorOcrError, corFileKind) live in src/lib/corOcrCore.js, which
// scripts/check-cor-ocr.mjs covers; they are re-exported here so app code imports from this file.
// Everything else is verified by hand (see PROGRESS.md).
//
// Phase 8 PACE 2b: a PDF that has a text layer (a digital COR, like the City College one) is read from
// that layer — exact characters, no OCR, no internet — with its lines rebuilt from the text's positions
// (a PDF stores a table column by column, not row by row). OCR is only the fallback, for photos, scans
// and PDFs with no usable text layer.
//
// Both engines fetch their worker/core/language files from a CDN on first use by default (per
// the approved decision: added plainly, no self-hosting, no gating note). That means the very
// first OCR run on a device needs an internet connection — the same accepted exception the Map
// module already has ("Needs internet") — after which the browser's HTTP cache normally avoids
// re-downloading, though that part is outside this app's control.
//
// Per the approved decision, only the PDF's first page is rendered and OCR'd; classes on a later
// page would be missed. The file is read only in memory for this one call — never uploaded
// anywhere, matching the privacy note already shown on the Upload step — and nothing here is
// kept once the call returns.

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createWorker } from 'tesseract.js';
import { OCR_ERROR, CorOcrError, corFileKind, textFromItems } from './corOcrCore.js';
import { detectLayout } from './corParser.js';

export { OCR_ERROR, CorOcrError, corFileKind };

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// COR text is small, and OCR accuracy depends heavily on resolution. Measured on the real COR with Tesseract 5:
// at the old scale 2 (~144 dpi) a PDF page came back with merged digits ("3 3" -> "38"), lost times and 5 of 9
// rows unreadable; at ~300 dpi every row read correctly. So PDF pages are rendered at scale 4 (~300 dpi), and a
// small image (a phone screenshot is often ~1000 px wide) is enlarged to OCR_TARGET_WIDTH before it is read.
const PDF_RENDER_SCALE = 4;
const OCR_TARGET_WIDTH = 2500;
const OCR_MAX_UPSCALE = 4;

/**
 * Frees a PDF's worker resources. It goes through the loading task (`task.destroy()`), not the document
 * proxy: the installed pdfjs-dist has no `doc.destroy()`, and calling it threw "doc.destroy is not a
 * function" after the page had already rendered, which failed every PDF. Cleanup is best-effort and must
 * never turn a finished render into an error.
 */
async function closePdf(task) {
  try {
    await task?.destroy();
  } catch {
    // cleanup only: nothing to recover
  }
}

/**
 * Page 1's own text, rebuilt into visual lines (see corOcrCore.itemsToLines). Returns '' for a scan, a PDF with
 * no text, or anything pdfjs can't read: the caller then falls back to OCR, so this never throws.
 */
async function pdfTextLayer(file) {
  let task;
  try {
    task = getDocument({ data: await file.arrayBuffer() });
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return textFromItems(
      content.items
        .filter((it) => typeof it.str === 'string' && Array.isArray(it.transform))
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height || Math.abs(it.transform[3]) })),
    );
  } catch {
    return '';
  } finally {
    await closePdf(task);
  }
}

/** Renders page 1 of a PDF File to an off-screen canvas, per the "first page only" decision. */
async function pdfFirstPageToCanvas(file) {
  let task;
  let doc;
  try {
    task = getDocument({ data: await file.arrayBuffer() });
    doc = await task.promise;
  } catch {
    await closePdf(task);
    throw new CorOcrError(OCR_ERROR.DECODE_FAILED, "Couldn't open that PDF. Try a clearer scan or a photo instead.");
  }
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas;
  } finally {
    await closePdf(task);
  }
}

/** Decodes an image File onto an off-screen canvas, enlarged first when it is too small for OCR to read reliably. */
async function imageFileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new CorOcrError(OCR_ERROR.DECODE_FAILED, "Couldn't open that image. Try another file."));
      el.src = url;
    });
    const scale = Math.min(OCR_MAX_UPSCALE, Math.max(1, OCR_TARGET_WIDTH / img.naturalWidth));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * File -> raw text. A PDF's own text layer is used when it holds a recognized COR; otherwise (and for every
 * image) the page is OCR'd — a PDF's first page is rendered to a canvas first. The caller is expected to have already run validateCorFile
 * (src/lib/cor.js), so an unsupported extension here means that check was skipped.
 */
export async function extractCorText(file) {
  const kind = corFileKind(file);
  if (!kind) throw new CorOcrError(OCR_ERROR.UNSUPPORTED_TYPE, 'That file type is not supported.');

  if (kind === 'pdf') {
    const layerText = await pdfTextLayer(file);
    if (detectLayout(layerText)) return layerText;   // a digital COR: exact text, no OCR needed
  }

  const canvas = kind === 'pdf' ? await pdfFirstPageToCanvas(file) : await imageFileToCanvas(file);

  const worker = await createWorker('eng', 1);
  try {
    const { data } = await worker.recognize(canvas);
    return data.text;
  } catch {
    throw new CorOcrError(OCR_ERROR.ENGINE_FAILED, "Couldn't read the text in that file. Try a clearer scan or photo.");
  } finally {
    await worker.terminate();
  }
}