/**
 * Build an in-memory ZIP for report export-package (PDF + JSON).
 */

import { ZipArchive } from "archiver";

export interface ReportPackageZipEntry {
  name: string;
  buffer: Buffer;
}

export async function buildReportPackageZip(
  entries: ReportPackageZipEntry[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    archive.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    archive.on("error", reject);

    for (const entry of entries) {
      archive.append(entry.buffer, { name: entry.name });
    }

    void archive.finalize();
  });
}
