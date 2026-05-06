import { extname } from "node:path";

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...Array.from(bytes.slice(start, end)));
}

export function extensionFromBytes(bytes: Uint8Array, contentType = "", source = ""): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") {
    return ".png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return ".jpg";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return ".webp";
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return ".gif";
  }
  if (/image\/svg\+xml/i.test(contentType) || ascii(bytes, 0, Math.min(bytes.length, 128)).includes("<svg")) {
    return ".svg";
  }

  const contentTypeExt = contentType.match(/image\/(png|jpe?g|webp|gif)/i)?.[1]?.toLowerCase();
  if (contentTypeExt) {
    return contentTypeExt === "jpeg" ? ".jpg" : `.${contentTypeExt}`;
  }

  const pathExt = extname(source.split(/[?#]/, 1)[0] ?? "").toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(pathExt)) {
    return pathExt === ".jpeg" ? ".jpg" : pathExt;
  }

  return ".bin";
}
