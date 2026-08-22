import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
    name: string;
    username: string;
    password?: string;
    token?: string;
}

const userSchema = new Schema<IUser>(
    {
        name: { type: String, required: true },
        username: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        token: { type: String }
    }
);

const User = mongoose.model<IUser>("User", userSchema);

export { User };