/**
 * The one owner of "which evidence classes each submission path accepts".
 *
 * RA-8388, founder ruling 17/11/2026 after the third failed review. The
 * evidence route has two ways in: a JSON body with no file (notes and
 * readings), and a file upload (photographs, video, documents). Each path can
 * build the record behind some classes and not others. The JSON path builds a
 * moisture, ambient or equipment row from the values typed in; it has no file,
 * so it cannot hold a photograph. The file path stores the file; it has no
 * typed values, so it cannot hold a reading.
 *
 * Both paths used to accept any class and store the item alone when they
 * could not build its record. A photograph uploaded as a "moisture reading"
 * was then counted as a reading with no measurement, and a JSON body labelled
 * "damage photograph" became a verified photograph with no picture.
 *
 * So each path asks this module before it stores anything, and so does the
 * capture screen when it decides which form to open. A class is accepted on
 * exactly one path. The guard test
 * `scripts/ci/__tests__/ra-8388-submission-path-classes.test.ts` checks every
 * class against both paths of the route.
 *
 * No imports: the capture screen is a client component and calls this too.
 */

export type EvidenceSubmissionPath = "json" | "file";

/**
 * Notes and readings: typed into the metadata form, sent as JSON, no file.
 * Every other class is sent as a file.
 */
const METADATA_ONLY_CLASSES: ReadonlySet<string> = new Set([
  "TECHNICIAN_NOTE",
  "MOISTURE_READING",
  "AMBIENT_ENVIRONMENTAL",
  "EQUIPMENT_LOG",
]);

/** Whether a class is captured as typed values with no file. */
export function isMetadataOnlyEvidenceClass(evidenceClass: string): boolean {
  return METADATA_ONLY_CLASSES.has(evidenceClass);
}

/** The one path a class may be submitted on. */
export function submissionPathForEvidenceClass(
  evidenceClass: string,
): EvidenceSubmissionPath {
  return isMetadataOnlyEvidenceClass(evidenceClass) ? "json" : "file";
}

/**
 * Whether `path` may store an item of this class. The caller has already
 * checked that the class is a real `EvidenceClass`.
 */
export function evidenceClassAllowedOnPath(
  evidenceClass: string,
  path: EvidenceSubmissionPath,
): boolean {
  return submissionPathForEvidenceClass(evidenceClass) === path;
}

/** The sentence a refused submission is given. One wording, both paths. */
export function wrongSubmissionPathMessage(
  path: EvidenceSubmissionPath,
): string {
  return path === "json"
    ? "This type of evidence needs its file, so it cannot be sent as a note or reading. Nothing was saved."
    : "This type of evidence is a note or reading, so it cannot be sent as a file. Nothing was saved.";
}
