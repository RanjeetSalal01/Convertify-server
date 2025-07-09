import sharp from "sharp";
import { Document, Packer, Paragraph, ImageRun } from "docx";
import libre from "libreoffice-convert";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import os from "os";
import path from "path";

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

export async function convertFile(buffer: Buffer, sourceFormat: string, targetFormat: string): Promise<{ convertedBuffer: Buffer, resourceType: "image" | "raw" }> {
  let convertedBuffer: Buffer;
  let resourceType: "image" | "raw" = "raw";

  // IMAGE → IMAGE
  if (imageFormats.includes(sourceFormat) && imageFormats.includes(targetFormat)) {
    convertedBuffer = await sharp(buffer).toFormat(targetFormat as any).toBuffer();
    resourceType = "image";
  }
  // IMAGE → PDF
  else if (imageFormats.includes(sourceFormat) && targetFormat === "pdf") {
    // Always embed as PNG for maximum compatibility
    const processedBuffer = await sharp(buffer).png({ quality: 90 }).toBuffer();
    const metadata = await sharp(processedBuffer).metadata();
    const imgWidth = metadata.width || 600;
    const imgHeight = metadata.height || 800;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([imgWidth, imgHeight]);
    const image = await pdfDoc.embedPng(processedBuffer);
    page.drawImage(image, { x: 0, y: 0, width: imgWidth, height: imgHeight });
    const pdfBytes = await pdfDoc.save();
    if (!pdfBytes || pdfBytes.length < 100) {
      throw new Error("Generated PDF is empty or invalid.");
    }
    convertedBuffer = Buffer.from(pdfBytes);
    resourceType = "raw";
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
  else if (sourceFormat === "docx" && targetFormat === "pdf") {
    // Use a unique temp directory for each conversion
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "convertify-"));
    const inputPath = path.join(tmpDir, `input.docx`);
    const outputPath = path.join(tmpDir, `output.pdf`);
    try {
      fs.writeFileSync(inputPath, buffer);
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        libre.convert(fs.readFileSync(inputPath), ".pdf", undefined, (err: any, done: any) => {
          if (err) reject(new Error(`LibreOffice conversion failed: ${err.message || err}`));
          else resolve(done as Buffer);
        });
      });
      if (!pdfBuffer || pdfBuffer.length < 100) {
        throw new Error("Generated PDF is empty or invalid.");
      }
      convertedBuffer = Buffer.from(pdfBuffer);
      resourceType = "raw";
    } finally {
      // Clean up temp files and directory
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        fs.rmdirSync(tmpDir, { recursive: true });
      } catch (cleanupErr) {
        // Ignore ENOTEMPTY errors, log others
        if (cleanupErr.code !== "ENOTEMPTY") {
          console.error("Temp cleanup error:", cleanupErr);
        }
      }
    }
  }
  // DOCX → TXT
  else if (sourceFormat === "docx" && targetFormat === "txt") {
    const result = await mammoth.extractRawText({ buffer });
    convertedBuffer = Buffer.from(result.value, "utf-8");
    resourceType = "raw";
  }
  // TXT → DOCX
  else if (sourceFormat === "txt" && targetFormat === "docx") {
    const text = buffer.toString("utf-8");
    const paragraphs = text.split("\n").filter((line) => line.trim() !== "");
    const doc = new Document({
      sections: [
        {
          children: paragraphs.map((paragraph) => new Paragraph(paragraph.trim())),
        },
      ],
    });
    convertedBuffer = await Packer.toBuffer(doc);
    resourceType = "raw";
  }
  // PDF → TXT
  else if (sourceFormat === "pdf" && targetFormat === "txt") {
    const data = await pdfParse(buffer);
    convertedBuffer = Buffer.from(data.text, "utf-8");
    resourceType = "raw";
  }
  // PDF → DOCX
  else if (sourceFormat === "pdf" && targetFormat === "docx") {
    const data = await pdfParse(buffer);
    const paragraphs = data.text.split("\n").filter((line) => line.trim() !== "");
    const doc = new Document({
      sections: [
        {
          children: paragraphs.map((paragraph) => new Paragraph(paragraph.trim())),
        },
      ],
    });
    convertedBuffer = await Packer.toBuffer(doc);
    resourceType = "raw";
  }
  // TXT → PDF
  else if (sourceFormat === "txt" && targetFormat === "pdf") {
    const text = buffer.toString("utf-8");
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;
    const lineHeight = 18;
    const margin = 50;
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    let y = page.getHeight() - margin;
    for (const line of lines) {
      if (y < margin) {
        const newPage = pdfDoc.addPage([595.28, 841.89]);
        y = newPage.getHeight() - margin;
        page.drawText = newPage.drawText.bind(newPage);
      }
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight;
    }
    convertedBuffer = Buffer.from(await pdfDoc.save());
    resourceType = "raw";
  }
  // Not implemented or unsupported
  else {
    throw new Error(`Conversion from ${sourceFormat} to ${targetFormat} is not supported.`);
  }

  return { convertedBuffer, resourceType };
}
