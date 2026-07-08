import { Schema, model, models, type InferSchemaType } from "mongoose";

const userSchema = new Schema({ name: { type: String, trim: true }, email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true }, passwordHash: { type: String, required: true } }, { timestamps: true });
export type UserDocument = InferSchemaType<typeof userSchema> & { _id: unknown };
export const UserModel = models.User ?? model("User", userSchema);
