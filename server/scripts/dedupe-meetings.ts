/**
 * One-off migration: collapses duplicate (user_id, meetingCode) history rows,
 * keeping the most recent, then builds the unique index the Meeting model
 * declares. Safe to run more than once.
 *
 *   bun scripts/dedupe-meetings.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import { Meeting } from "../src/models/meeting.model.js";

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("MONGO_URI is not defined in .env");

await mongoose.connect(mongoUri, { autoIndex: false });

const groups = await Meeting.aggregate<{ ids: mongoose.Types.ObjectId[] }>([
    { $sort: { date: -1 } },
    {
        $group: {
            _id: { user_id: "$user_id", meetingCode: "$meetingCode" },
            ids: { $push: "$_id" },
            count: { $sum: 1 }
        }
    },
    { $match: { count: { $gt: 1 } } }
]);

// ids are newest first, so keep the head and drop the rest.
const stale = groups.flatMap((group) => group.ids.slice(1));
if (stale.length > 0) {
    const { deletedCount } = await Meeting.deleteMany({ _id: { $in: stale } });
    console.log(`Removed ${deletedCount} duplicate rows across ${groups.length} rooms`);
} else {
    console.log("No duplicates found");
}

await Meeting.syncIndexes();
console.log("Indexes in sync");

await mongoose.disconnect();
