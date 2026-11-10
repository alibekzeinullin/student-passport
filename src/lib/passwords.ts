import "server-only";
import { randomInt } from "node:crypto";

/** Временный пароль: легко продиктовать, без похожих символов (0/O, 1/l). */
export function generatePassword(): string {
  const words = ["sky", "sun", "star", "moon", "river", "peak", "wind", "leaf", "wave", "fox", "owl", "bear"];
  const caps = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const word = words[randomInt(words.length)];
  const digits = String(randomInt(1000, 10000));
  return `${caps[randomInt(caps.length)]}${word}-${digits}`;
}
