// iPhone photos arrive as HEIC, which most browsers can't display. Convert them to
// JPEG in the browser before upload so the other person sees a normal image (HW-S12).
export async function normaliseImage(file: File): Promise<File> {
  const isHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!isHeic) return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const out = (await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })) as Blob | Blob[];
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file; // keep the original; it can still be downloaded
  }
}
