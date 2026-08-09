import { signStoredMediaUrl } from "@/lib/storage/sign-stored-url";

export async function signEvidencePinUrls<
  T extends {
    fileUrl?: string | null;
    thumbnailUrl?: string | null;
  },
>(pin: T): Promise<T> {
  const [fileUrl, thumbnailUrl] = await Promise.all([
    signStoredMediaUrl(pin.fileUrl),
    signStoredMediaUrl(pin.thumbnailUrl),
  ]);

  return { ...pin, fileUrl, thumbnailUrl };
}
