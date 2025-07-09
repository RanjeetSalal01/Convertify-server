import { Document, ImageRun, Packer, Paragraph } from "docx";
import fs from "fs";
import libre from "libreoffice-convert";
import mammoth from "mammoth";
import os from "os";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import pdfParse from "pdf-parse";
import sharp from "sharp";

const imageFormats = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "tiff",
  "gif",
  "avif",
  "heif",
];

export async function convertFile(
  buffer: Buffer,
  sourceFormat: string,
  targetFormat: string
): Promise<{ convertedBuffer: Buffer; resourceType: "image" | "raw" }> {
  let convertedBuffer: Buffer;
  let resourceType: "image" | "raw" = "raw";

  // IMAGE → IMAGE
  if (
    imageFormats.includes(sourceFormat) &&
    imageFormats.includes(targetFormat)
  ) {
    convertedBuffer = await sharp(buffer)
      .toFormat(targetFormat as any)
      .toBuffer();
    resourceType = "image";
  }

  // IMAGE → DOCX
  else if (imageFormats.includes(sourceFormat) && targetFormat === "docx") {
    let processedBuffer: Buffer;
    let imageType: "png" | "jpg";
    if (["png", "webp", "gif"].includes(sourceFormat)) {
      processedBuffer = await sharp(buffer).png({ quality: 90 }).toBuffer();
      imageType = "png";
    } else {
      processedBuffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
      imageType = "jpg";
    }
    const metadata = await sharp(processedBuffer).metadata();
    const imageWidth = metadata.width || 400;
    const imageHeight = metadata.height || 300;
    const maxWidth = 500;
    let finalWidth = imageWidth;
    let finalHeight = imageHeight;
    if (imageWidth > maxWidth) {
      const ratio = maxWidth / imageWidth;
      finalWidth = maxWidth;
      finalHeight = Math.round(imageHeight * ratio);
    }
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new ImageRun({
                  data: processedBuffer,
                  transformation: { width: finalWidth, height: finalHeight },
                  type: imageType,
                }),
              ],
            }),
          ],
        },
      ],
    });
    convertedBuffer = await Packer.toBuffer(doc);
    resourceType = "raw";
  }
  // DOCX → PDF
  // DOCX → TXT
  // TXT → DOCX
  // PDF → TXT
  // PDF → DOCX
  // TXT → PDF
 
  // Not implemented or unsupported
  else {
    throw new Error(
      `Conversion from ${sourceFormat} to ${targetFormat} is not supported.`
    );
  }

  return { convertedBuffer, resourceType };
}
