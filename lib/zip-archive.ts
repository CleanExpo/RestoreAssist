import { createZipArchive as openZipArchive } from "@/lib/exports/create-zip-archive";

interface ZipItem {
  reportNumber: string;
  clientName: string;
  buffer: Buffer;
  pdfType?: string;
}

interface Report {
  id: string;
  reportNumber: string | null;
  clientName: string;
}

/**
 * Create a ZIP archive from PDF buffers
 */
export async function createZipArchive(
  pdfBuffers: ZipItem[],
  _reports?: Report[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = openZipArchive({ zlib: { level: 9 } });
    const buffers: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => {
      buffers.push(chunk);
    });

    archive.on("end", () => {
      resolve(Buffer.concat(buffers));
    });

    archive.on("error", (err: Error) => {
      reject(err);
    });

    pdfBuffers.forEach((item) => {
      const filename = item.reportNumber
        ? `${item.reportNumber}_${item.clientName.replace(/[^a-z0-9]/gi, "_")}.pdf`
        : `report_${item.clientName.replace(/[^a-z0-9]/gi, "_")}.pdf`;

      archive.append(item.buffer, { name: filename });
    });

    void archive.finalize();
  });
}
