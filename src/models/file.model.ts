import { getModelForClass, prop } from "@typegoose/typegoose";
import { ObjectId } from "mongoose";

class ConvertedFile {
  readonly _id: ObjectId;

  readonly createdAt: Date;

  readonly updatedAt: Date;

  @prop({ required: true })
  originalName: string;

  @prop({ required: true })
  convertedUrl: string;

  @prop({ required: true })
  format: string;

  @prop({ required: true })
  userId: string;
}

export const ConvertedFileModel = getModelForClass(ConvertedFile, {
  schemaOptions: {
    timestamps: true,
  },
});
