import { Request, Response } from "express";
import { cloudinaryUploader } from "../utils/common/cloudinary-service";
import { ConvertedFileModel } from "../models/file.model";
import sharp from "sharp";
import streamifier from "streamifier";
import { Document, Packer, Paragraph, ImageRun } from "docx";
import libre from "libreoffice-convert";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
// import jsPDF from "jspdf";

function getExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function getFileNameWithoutExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, "");
}

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
const docFormats = ["docx", "pdf", "txt"];

export const convertAndUpload = async (req: Request, res: Response) => {
  try {
    const file = (req as any).files?.file || (req as any).file;
    if (!file) {
      return res
        .status(400)
        .send({ success: false, error: "No file uploaded" });
    }

    const buffer: Buffer = file.data || file.buffer;
    const originalName: string = file.name || file.originalname;
    const { targetFormat } = req.body;

    if (!targetFormat) {
      return res
        .status(400)
        .send({ success: false, error: "No target format specified" });
    }

    const sourceFormat = getExtension(originalName);
    let convertedBuffer: Buffer;
    let resourceType: "image" | "raw" = "raw";

    // IMAGE → IMAGE //done
    if (
      imageFormats.includes(sourceFormat) &&
      imageFormats.includes(targetFormat)
    ) {
      convertedBuffer = await sharp(buffer)
        .toFormat(targetFormat as any)
        .toBuffer();
      resourceType = "image";
    }

    // IMAGE → PDF
    else if (imageFormats.includes(sourceFormat) && targetFormat === "pdf") {
      try {
        const processedBuffer = await sharp(buffer)
          .jpeg({ quality: 90 })
          .toBuffer();

        const metadata = await sharp(processedBuffer).metadata();
        const imgWidth = metadata.width || 600;
        const imgHeight = metadata.height || 800;

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([imgWidth, imgHeight]);

        const image = await pdfDoc.embedJpg(processedBuffer);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: imgWidth,
          height: imgHeight,
        });

        convertedBuffer = Buffer.from(await pdfDoc.save());
        resourceType = "raw";
      } catch (error) {
        console.error("Image to PDF conversion error:", error);
        throw new Error(
          `Failed to convert image to PDF: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // IMAGE → DOCX //done
    else if (imageFormats.includes(sourceFormat) && targetFormat === "docx") {
      try {
        // Convert image to appropriate format
        let processedBuffer: Buffer;
        let imageType: "png" | "jpg";

        if (
          sourceFormat === "png" ||
          sourceFormat === "webp" ||
          sourceFormat === "gif"
        ) {
          processedBuffer = await sharp(buffer).png({ quality: 90 }).toBuffer();
          imageType = "png";
        } else {
          processedBuffer = await sharp(buffer)
            .jpeg({ quality: 90 })
            .toBuffer();
          imageType = "jpg";
        }

        // Get image dimensions
        const metadata = await sharp(processedBuffer).metadata();
        const imageWidth = metadata.width || 400;
        const imageHeight = metadata.height || 300;

        // Scale image to fit document (max width 500px to fit A4)
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
                      transformation: {
                        width: finalWidth,
                        height: finalHeight,
                      },
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
      } catch (error) {
        console.error("Image to DOCX conversion error:", error);
        throw new Error(
          `Failed to convert image to DOCX: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // DOCX → PDF
    else if (sourceFormat === "docx" && targetFormat === "pdf") {
      try {
        convertedBuffer = await new Promise<Buffer>((resolve, reject) => {
          libre.convert(buffer, ".pdf", undefined, (err: any, done: any) => {
            if (err) {
              console.error("LibreOffice conversion error:", err);
              reject(
                new Error(
                  `LibreOffice conversion failed: ${err.message || err}`
                )
              );
            } else {
              resolve(done as Buffer);
            }
          });
        });
        resourceType = "raw";
      } catch (error) {
        console.error("DOCX to PDF conversion error:", error);
        throw new Error(
          `Failed to convert DOCX to PDF: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // DOCX → TXT
    else if (sourceFormat === "docx" && targetFormat === "txt") {
      try {
        const result = await mammoth.extractRawText({ buffer });
        convertedBuffer = Buffer.from(result.value, "utf-8");
        resourceType = "raw";
      } catch (error) {
        console.error("DOCX to TXT conversion error:", error);
        throw new Error(
          `Failed to convert DOCX to TXT: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // TXT → DOCX //done
    else if (sourceFormat === "txt" && targetFormat === "docx") {
      try {
        const text = buffer.toString("utf-8");

        // Split text into paragraphs
        const paragraphs = text
          .split("\n")
          .filter((line) => line.trim() !== "");

        const doc = new Document({
          sections: [
            {
              children: paragraphs.map(
                (paragraph) => new Paragraph(paragraph.trim())
              ),
            },
          ],
        });

        convertedBuffer = await Packer.toBuffer(doc);
        resourceType = "raw";
      } catch (error) {
        console.error("TXT to DOCX conversion error:", error);
        throw new Error(
          `Failed to convert TXT to DOCX: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // PDF → TXT
    else if (sourceFormat === "pdf" && targetFormat === "txt") {
      try {
        const data = await pdfParse(buffer);
        convertedBuffer = Buffer.from(data.text, "utf-8");
        resourceType = "raw";
      } catch (error) {
        console.error("PDF to TXT conversion error:", error);
        throw new Error(
          `Failed to convert PDF to TXT: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // PDF → DOCX
    else if (sourceFormat === "pdf" && targetFormat === "docx") {
      try {
        const data = await pdfParse(buffer);

        // Split text into paragraphs
        const paragraphs = data.text
          .split("\n")
          .filter((line) => line.trim() !== "");

        const doc = new Document({
          sections: [
            {
              children: paragraphs.map(
                (paragraph) => new Paragraph(paragraph.trim())
              ),
            },
          ],
        });

        convertedBuffer = await Packer.toBuffer(doc);
        resourceType = "raw";
      } catch (error) {
        console.error("PDF to DOCX conversion error:", error);
        throw new Error(
          `Failed to convert PDF to DOCX: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // TXT → PDF
    else if (sourceFormat === "txt" && targetFormat === "pdf") {
      try {
        const text = buffer.toString("utf-8");
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points

        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 12;
        const lineHeight = 18;
        const margin = 50;

        const lines = text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        let y = page.getHeight() - margin;

        for (const line of lines) {
          if (y < margin) {
            const newPage = pdfDoc.addPage([595.28, 841.89]);
            y = newPage.getHeight() - margin;
            page.drawText = newPage.drawText.bind(newPage); // switch drawing context
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
      } catch (error) {
        console.error("TXT to PDF conversion error:", error);
        throw new Error(
          `Failed to convert TXT to PDF: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    // Not implemented or unsupported
    else {
      return res.status(400).send({
        success: false,
        error: `Conversion from ${sourceFormat} to ${targetFormat} is not supported.`,
      });
    }

    // Upload to Cloudinary
    const uploadFromBuffer = (buffer: Buffer): Promise<any> => {
      return new Promise<any>((resolve, reject) => {
        const stream = cloudinaryUploader.upload_stream(
          {
            folder: "convertify",
            resource_type: resourceType,
            format: targetFormat,
            public_id: getFileNameWithoutExtension(originalName),
            overwrite: true,
          },
          (error: any, result: any) => {
            if (result) {
              console.log("Cloudinary upload result:", result);
              resolve(result);
            } else {
              console.error("Cloudinary upload error:", error);
              reject(
                new Error(
                  `Cloudinary upload failed: ${error?.message || error}`
                )
              );
            }
          }
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
    };

    const uploadRes = await uploadFromBuffer(convertedBuffer);

    const dbEntry = await ConvertedFileModel.create({
      originalName,
      convertedUrl: uploadRes.secure_url,
      format: targetFormat,
      userId: (req as any).user?._id || "anonymous",
    });

    return res.status(200).send({
      success: true,
      result: dbEntry,
      url: uploadRes.secure_url,
    });
  } catch (err) {
    console.error("Conversion error:", err);
    return res.status(500).send({
      success: false,
      error: "Conversion failed",
      details: err instanceof Error ? err.message : String(err),
    });
  }
};
