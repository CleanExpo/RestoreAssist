/**
 * Archiver v8 exports ZipArchive as a named class; @types/archiver still
 * describe the old default factory. This wrapper keeps call sites typed.
 */

import * as ArchiverNS from "archiver";

export type ZipArchiveInstance = {
  on(event: "data", listener: (chunk: Buffer) => void): ZipArchiveInstance;
  on(event: "end", listener: () => void): ZipArchiveInstance;
  on(event: "error", listener: (err: Error) => void): ZipArchiveInstance;
  on(event: string, listener: (...args: unknown[]) => void): ZipArchiveInstance;
  append(
    source: Buffer | string | NodeJS.ReadableStream,
    data: { name: string },
  ): ZipArchiveInstance;
  finalize(): void | Promise<void>;
  pipe(dest: NodeJS.WritableStream): NodeJS.WritableStream;
};

type ZipArchiveConstructor = new (options?: {
  zlib?: { level?: number };
}) => ZipArchiveInstance;

export function createZipArchive(options?: {
  zlib?: { level?: number };
}): ZipArchiveInstance {
  const ZipArchive = (ArchiverNS as unknown as { ZipArchive: ZipArchiveConstructor })
    .ZipArchive;
  if (!ZipArchive) {
    throw new Error("archiver ZipArchive export is unavailable");
  }
  return new ZipArchive(options);
}
