import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
    name: string;
    username: string;
    password?: string;
    /** Bumped on password change; tokens carrying an older value are rejected. */
    tokenVersion?: number;
}

const userSchema = new Schema<IUser>(
    {
        name: { type: String, required: true },
        username: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        tokenVersion: { type: Number, default: 0 }
    }
);

const User = mongoose.model<IUser>("User", userSchema);

export { User };
