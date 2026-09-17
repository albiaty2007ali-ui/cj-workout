/**
 * قص مربّع + تصغير لصورة البروفايل من طرف المتصفح (Canvas API) قبل الرفع — صفر معالجة صور
 * على السيرفر (صفر sharp/تبعية Node جديدة، صفر مخاطرة Native Binary مع esbuild bundler).
 */
const OUTPUT_SIZE = 512;
const JPEG_QUALITY = 0.85;

export interface ResizedImage {
  base64: string;
  contentType: "image/jpeg";
}

export async function resizeImageToSquareJpeg(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذّر تجهيز الصورة.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("تعذّر تجهيز الصورة.");

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("تعذّر قراءة الصورة."));
    reader.readAsDataURL(blob);
  });

  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { base64, contentType: "image/jpeg" };
}
