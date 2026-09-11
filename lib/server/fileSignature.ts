/**
 * Verifies a file's actual bytes match its declared image MIME type via a
 * magic-number/signature check. Without this, `attachment.mimeType` is only
 * ever checked against an allow-list of strings (see the zod schema in the
 * messages route) — the client is fully trusted to have labeled the bytes
 * correctly, meaning a script could send arbitrary bytes labeled
 * "image/png" and have them accepted, sent to Gemini as inline image data,
 * and uploaded to Storage — where they could later be opened directly in a
 * browser tab via a signed URL (see PersistedImageAttachment.tsx /
 * GeneratedImageCard.tsx). That's a real content-type-confusion risk if
 * anything downstream ever serves or sniffs those bytes as something other
 * than an inert image.
 *
 * Document/dataset attachments don't need this: `extractDocumentText`'s
 * real PDF/DOCX parsers already reject mismatched bytes by failing to parse
 * them (caught as a clean `DocumentExtractionError` before anything is
 * persisted), and plain text/CSV has no fixed format to spoof in the first
 * place.
 */
export function matchesImageSignature(buffer: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case "image/png":
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "image/heic":
    case "image/heif":
      // ISO base media file format: a 4-byte box size, then the literal
      // "ftyp" box type. HEIC/HEIF's actual brand after that varies
      // (heic/heix/hevc/mif1/msf1/...), so this checks the container
      // format rather than an exact brand list.
      return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
    default:
      return false;
  }
}
