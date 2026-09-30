import type { Request, Response } from "express";
import type { Types } from "mongoose";
import { User } from "../models/user.model.js";
import bcrypt from "bcrypt";
import { Meeting } from "../models/meeting.model.js";
import { signToken } from "../middlewares/auth.middleware.js";
import type { AuthedRequest } from "../middlewares/auth.middleware.js";

const MIN_PASSWORD_LENGTH = 6;
// bcrypt ignores everything past 72 bytes, so longer passwords give a false sense of strength.
const MAX_PASSWORD_LENGTH = 72;
const MAX_NAME_LENGTH = 80;
const MAX_USERNAME_LENGTH = 254;
const MAX_MEETING_CODE_LENGTH = 64;
const MAX_TITLE_LENGTH = 120;

// Compared against when the username is unknown, so a miss costs the same
// bcrypt time as a wrong password and response timing does not reveal accounts.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

// Usernames are emails, which are case-insensitive in practice. New accounts are
// stored lowercased; lookups ignore case so accounts created before that rule
// (possibly mixed-case) can still sign in.
const CASE_INSENSITIVE = { locale: "en", strength: 2 } as const;
const normalizeUsername = (username: string): string => username.trim().toLowerCase();

const isNonEmptyString = (value: unknown, maxLength: number): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

const passwordProblem = (password: string): string | null => {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (Buffer.byteLength(password) > MAX_PASSWORD_LENGTH) {
        return `Password must be at most ${MAX_PASSWORD_LENGTH} bytes`;
    }
    return null;
};

export const login = async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body;

    // Rejecting non-strings also blocks query operators such as {"$ne": null}.
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
        res.status(400).json({ message: "Please provide username and password" });
        return;
    }

    try {
        const user = await User.findOne({ username: normalizeUsername(username) })
            .collation(CASE_INSENSITIVE);
        const isPasswordCorrect = await bcrypt.compare(
            password,
            (user?.password as string | undefined) ?? DUMMY_HASH
        );

        if (!user || !isPasswordCorrect) {
            res.status(401).json({ message: "Invalid username or password" });
            return;
        }

        const token = signToken(user);
        res.status(200).json({ token, name: user.name, username: user.username });
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const register = async (req: Request, res: Response): Promise<void> => {
    const { name, username, password } = req.body;

    if (
        !isNonEmptyString(name, MAX_NAME_LENGTH) ||
        !isNonEmptyString(username, MAX_USERNAME_LENGTH) ||
        typeof password !== "string"
    ) {
        res.status(400).json({ message: "Please provide name, username and password" });
        return;
    }

    const problem = passwordProblem(password);
    if (problem) {
        res.status(400).json({ message: problem });
        return;
    }

    try {
        const normalized = normalizeUsername(username);
        const existingUser = await User.findOne({ username: normalized })
            .collation(CASE_INSENSITIVE);
        if (existingUser) {
            res.status(409).json({ message: "User already exists" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name.trim(),
            username: normalized,
            password: hashedPassword
        });

        await newUser.save();
        res.status(201).json({ message: "User registered successfully" });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getUserHistory = async (req: Request, res: Response): Promise<void> => {
    const { username } = (req as AuthedRequest).user;

    try {
        const meetings = await Meeting.find({ user_id: username, deleted: { $ne: true } }).sort({ date: -1 });
        res.json(meetings);
    } catch (e) {
        console.error("History Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};

/** Records a visit. Rejoining the same room refreshes its row instead of adding another. */
export const addToHistory = async (req: Request, res: Response): Promise<void> => {
    const { username } = (req as AuthedRequest).user;
    const { meeting_code, title } = req.body;

    if (!isNonEmptyString(meeting_code, MAX_MEETING_CODE_LENGTH)) {
        res.status(400).json({ message: "Please provide meeting_code" });
        return;
    }

    if (title !== undefined && !isNonEmptyString(title, MAX_TITLE_LENGTH)) {
        res.status(400).json({ message: `Title must be at most ${MAX_TITLE_LENGTH} characters` });
        return;
    }

    try {
        await Meeting.updateOne(
            { user_id: username, meetingCode: meeting_code },
            { $set: { date: new Date(), deleted: false, ...(title ? { title } : {}) } },
            { upsert: true }
        );
        res.status(201).json({ message: "Added code to history" });
    } catch (e) {
        console.error("Add History Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteFromHistory = async (req: Request, res: Response): Promise<void> => {
    const { username } = (req as AuthedRequest).user;
    const { meeting_code } = req.query;

    if (!meeting_code || typeof meeting_code !== "string") {
        res.status(400).json({ message: "Please provide meeting_code" });
        return;
    }

    try {
        await Meeting.updateMany(
            { user_id: username, meetingCode: meeting_code },
            { $set: { deleted: true } }
        );

        res.status(200).json({ message: "Deleted from history" });
    } catch (e) {
        console.error("Delete History Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const clearHistory = async (req: Request, res: Response): Promise<void> => {
    const { username } = (req as AuthedRequest).user;

    try {
        await Meeting.updateMany(
            { user_id: username },
            { $set: { deleted: true } }
        );

        res.status(200).json({ message: "Cleared history" });
    } catch (e) {
        console.error("Clear History Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};


/** GET /profile — account details plus the stats the profile page shows. */
export const getProfile = async (req: Request, res: Response): Promise<void> => {
    const { username } = (req as AuthedRequest).user;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        // Matches what the dashboard lists, so deleted rows are not counted.
        const meetingCount = await Meeting.countDocuments({ user_id: username, deleted: { $ne: true } });

        res.json({
            name: user.name,
            username: user.username,
            // The schema has no timestamps, but an ObjectId embeds its creation
            // time, so this works for documents written before this endpoint.
            memberSince: (user._id as Types.ObjectId).getTimestamp(),
            meetingCount
        });
    } catch (e) {
        console.error("Get Profile Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};

/** PATCH /profile — the display name is the only editable field. */
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    const { username } = (req as AuthedRequest).user;
    const { name } = req.body;

    if (!isNonEmptyString(name, MAX_NAME_LENGTH)) {
        res.status(400).json({ message: `Please provide a name of at most ${MAX_NAME_LENGTH} characters` });
        return;
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        user.name = name.trim();
        await user.save();

        res.json({ name: user.name, username: user.username });
    } catch (e) {
        console.error("Update Profile Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};

/** POST /change_password — verifies the current password, then re-issues a token. */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    const { username } = (req as AuthedRequest).user;
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword) {
        res.status(400).json({
            message: "Please provide your current and new password"
        });
        return;
    }

    const problem = passwordProblem(newPassword);
    if (problem) {
        res.status(400).json({ message: problem });
        return;
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const isCurrentCorrect = await bcrypt.compare(
            currentPassword,
            user.password as string
        );
        if (!isCurrentCorrect) {
            // 400, not 401: the session is valid, only the input is wrong, and
            // the client treats 401 as "signed out".
            res.status(400).json({ message: "Current password is incorrect" });
            return;
        }

        user.password = await bcrypt.hash(newPassword, 10);
        // Invalidates every token issued before now, on every device.
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
        await user.save();

        // The caller gets a fresh token so this device stays signed in.
        res.json({ message: "Password updated", token: signToken(user) });
    } catch (e) {
        console.error("Change Password Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};
