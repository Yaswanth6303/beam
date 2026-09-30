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

// One row per user per room; addToHistory upserts against this.
// Run scripts/dedupe-meetings.ts once on older databases before deploying,
// or the index build fails on existing duplicates.
meetingSchema.index({ user_id: 1, meetingCode: 1 }, { unique: true });

const Meeting = mongoose.model<IMeeting>("Meeting", meetingSchema);

export { Meeting };