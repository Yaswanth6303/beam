import mongoose, { Schema, Document } from "mongoose";

export interface IMeeting extends Document {
    user_id: string;
    meetingCode: string;
    title?: string;
    date: Date;
    deleted?: boolean;
}

const meetingSchema = new Schema<IMeeting>(
    {
        user_id: { type: String, required: true },
        meetingCode: { type: String, required: true },
        title: { type: String },
        date: { type: Date, default: Date.now, required: true },
        deleted: { type: Boolean, default: false }
    }
);

const Meeting = mongoose.model<IMeeting>("Meeting", meetingSchema);

export { Meeting };