import { getModelForClass, prop } from "@typegoose/typegoose";
import { ObjectId } from "mongoose";

export class User {
  readonly _id: ObjectId;

  readonly createdAt: Date;

  readonly updatedAt: Date;

  @prop({ required: true })
  name: string;

  @prop({ required: true, unique: true })
  email: string;

  @prop({ required: true })
  password: string;

  @prop()
  phone?: string;

  @prop({ default: false })
  isDeleted: boolean;
}

export const UserModel = getModelForClass(User, {
  schemaOptions: { timestamps: true },
});
