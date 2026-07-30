"use client";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export interface ImagenComprimida {
  base64: string; // sin el prefijo "data:...;base64,"
  mediaType: "image/jpeg";
}

/** Comprime una foto de ticket antes de mandarla a la IA: redimensiona al lado más largo a
 * 1600px como máximo (nunca agranda) y la re-codifica como JPEG calidad 0.8. Rechaza archivos
 * de más de 5MB antes de intentar procesarlos. */
export async function compressImageFile(file: File): Promise<ImagenComprimida> {
  if (file.size > MAX_BYTES) {
    throw new Error("La imagen supera los 5MB. Elegí una foto más liviana.");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la imagen"));
    image.src = dataUrl;
  });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(img, 0, 0, width, height);

  const jpegDataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = jpegDataUrl.slice(jpegDataUrl.indexOf(",") + 1);
  return { base64, mediaType: "image/jpeg" };
}
