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
import { convertFile } from "../utils/common/file-conversion-service";
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

    try {
      const result = await convertFile(buffer, sourceFormat, targetFormat);
      convertedBuffer = result.convertedBuffer;
      resourceType = result.resourceType;
    } catch (error) {
      return res.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : String(error),
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
