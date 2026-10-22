import { createClient } from "@/lib/supabase/client";

/** Квадратное фото 320×320 (обрезка по центру), webp — около 20–40 КБ. */
async function toSquareWebp(file: File, size = 320): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (blob) return blob;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!jpeg) throw new Error("Не удалось подготовить фото");
  return jpeg;
}

/** Загрузить фото ученика в Supabase Storage, вернуть публичную ссылку. */
export async function uploadAvatar(studentId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Нужна картинка (jpg, png, webp)");
  if (file.size > 15 * 1024 * 1024) throw new Error("Файл слишком большой (до 15 МБ)");
  const blob = await toSquareWebp(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${studentId}/${Date.now()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType: blob.type, upsert: true, cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}
