import "server-only";

import fs from "fs";
import path from "path";
import type { PDFDocument, PDFFont } from "pdf-lib";

/**
 * Single source of truth for the fonts every generated PDF uses.
 *
 * **Why this exists.** pdf-lib's `StandardFonts.Helvetica` is WinAnsi-encoded.
 * WinAnsi covers Latin-1 but not Latin Extended-A, so the Māori macrons —
 * ā ē ī ō ū and their capitals — cannot be encoded, and pdf-lib *throws* on
 * them in both `widthOfTextAtSize` and `drawText`:
 *
 *     WinAnsi cannot encode "ā" (0x0101)
 *
 * Every PDF this product generates renders user-supplied text: a property
 * address, a customer name, a business name. So before this module, a customer
 * at Whangārei or Ōtorohanga could not be issued an invoice, a consumer report,
 * an authority form, a sketch PDF or a progress document — the request threw.
 * That is the New Zealand market the AU/NZ work exists to serve.
 *
 * **Why Liberation Sans.** The five generators lay text out by hand, measuring
 * with `widthOfTextAtSize` and positioning against those measurements. A font
 * with different metrics would shift every line of every document. Liberation
 * Sans is metric-compatible with Arial/Helvetica: measured against the standard
 * Helvetica across realistic strings the worst drift is 1.46%, and typical
 * drift is under 0.1%. Licensed SIL OFL-1.1 — see `assets/fonts/LICENSE.txt`.
 *
 * **Why it throws when the asset is missing.** The tempting alternative is to
 * fall back to `StandardFonts.Helvetica`. That would silently reintroduce the
 * exact bug this module removes, and it would do so only in the environment
 * where the asset failed to deploy — which is production. A missing font is a
 * deployment fault and must be loud. `scripts/check-pdf-fonts.mjs` runs in CI
 * so the build fails first, and `next.config.mjs` traces the directory into the
 * serverless bundles.
 */

/** Repository-relative location of the embedded font assets. */
export const PDF_FONT_DIR = path.join("assets", "fonts");

const REGULAR_FILE = "LiberationSans-Regular.ttf";
const BOLD_FILE = "LiberationSans-Bold.ttf";

export const PDF_FONT_FILES = [REGULAR_FILE, BOLD_FILE] as const;

/** Both weights a document needs, embedded into one `PDFDocument`. */
export interface DocumentFonts {
  regular: PDFFont;
  bold: PDFFont;
}

/**
 * Read the font bytes once per process. The files are ~400 KB each and never
 * change at runtime, so re-reading them per PDF is pure waste on a path that
 * already does image work.
 */
let cachedBytes: { regular: Buffer; bold: Buffer } | null = null;

function fontPath(file: string): string {
  return path.join(process.cwd(), PDF_FONT_DIR, file);
}

function readFontBytes(): { regular: Buffer; bold: Buffer } {
  if (cachedBytes) return cachedBytes;

  const missing = PDF_FONT_FILES.filter((f) => !fs.existsSync(fontPath(f)));
  if (missing.length > 0) {
    throw new Error(
      `PDF font assets missing: ${missing.join(", ")}. Expected under ` +
        `${PDF_FONT_DIR}/ relative to the process working directory. This is a ` +
        `deployment fault — check outputFileTracingIncludes in next.config.mjs. ` +
        `Falling back to a WinAnsi standard font is deliberately not done, ` +
        `because it would silently break Māori macrons again.`,
    );
  }

  cachedBytes = {
    regular: fs.readFileSync(fontPath(REGULAR_FILE)),
    bold: fs.readFileSync(fontPath(BOLD_FILE)),
  };
  return cachedBytes;
}

/**
 * Embed the regular and bold document fonts into `pdfDoc`.
 *
 * Call once per document and pass the result down; embedding twice puts two
 * copies of the font in the output file.
 *
 * `subset: true` keeps only the glyphs actually drawn, so the ~400 KB source
 * face costs a few KB in the produced PDF.
 *
 * @param pdfDoc A freshly created or loaded `PDFDocument`.
 * @returns The regular and bold faces, ready to pass to `drawText`.
 */
export async function embedDocumentFonts(
  pdfDoc: PDFDocument,
): Promise<DocumentFonts> {
  // Imported lazily: fontkit is only needed on the PDF paths, and pulling it
  // into every module that touches pdf-lib types would widen the bundle.
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  pdfDoc.registerFontkit(fontkit);

  const bytes = readFontBytes();
  const [regular, bold] = await Promise.all([
    pdfDoc.embedFont(bytes.regular, { subset: true }),
    pdfDoc.embedFont(bytes.bold, { subset: true }),
  ]);

  return { regular, bold };
}
