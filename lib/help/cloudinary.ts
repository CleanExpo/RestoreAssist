export type CloudinaryUrlOpts = {
  cloudName?: string;
  width?: number;
  height?: number;
  quality?: "auto" | number;
  format?: "auto" | "webp" | "avif" | "jpg" | "png";
};

function resolveCloudName(opts: CloudinaryUrlOpts): string {
  if (opts.cloudName) return opts.cloudName;
  const fromUrl = process.env.CLOUDINARY_URL?.match(/cloudinary:\/\/[^@]+@(.+)$/)?.[1];
  if (!fromUrl) throw new Error("Cloudinary cloud name missing — set CLOUDINARY_URL or pass cloudName");
  return fromUrl;
}

export function cloudinaryUrl(publicId: string, opts: CloudinaryUrlOpts = {}): string {
  const cloud = resolveCloudName(opts);
  const transforms: string[] = [];
  if (opts.width) transforms.push(`w_${opts.width}`);
  if (opts.height) transforms.push(`h_${opts.height}`);
  if (opts.quality !== undefined) transforms.push(`q_${opts.quality}`);
  if (opts.format) transforms.push(`f_${opts.format}`);
  const tx = transforms.length ? transforms.join(",") + "/" : "";
  return `https://res.cloudinary.com/${cloud}/image/upload/${tx}${publicId}`;
}
