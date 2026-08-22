import type { Request, Response } from "express";
import type { Types } from "mongoose";
import { User } from "../models/user.model.js";
import type { IUser } from "../models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Meeting } from "../models/meeting.model.js";
import { JWT_SECRET } from "../middlewares/auth.middleware.js";
import type { AuthedRequest } from "../middlewares/auth.middleware.js";

const MIN_PASSWORD_LENGTH = 6;

/** Issues a 7 day token and stores it on the user, matching the login flow. */
const issueToken = async (user: IUser): Promise<string> => {
    const token = jwt.sign(
        { id: user._id, username: user.username },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
    user.token = token;
    await user.save();
    return token;
};

export const login = async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ message: "Please provide username and password" });
        return;
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password as string);

        if (isPasswordCorrect) {
            const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
            
            user.token = token;
            await user.save();
            
            res.status(200).json({ token, name: user.name, username: user.username });
        } else {
            res.status(401).json({ message: "Invalid username or password" });
        }
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const register = async (req: Request, res: Response): Promise<void> => {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
        res.status(400).json({ message: "Please provide name, username and password" });
        return;
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            res.status(409).json({ message: "User already exists" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            username,
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
    const { token } = req.query;

    if (!token || typeof token !== "string") {
        res.status(401).json({ message: "Unauthorized: Missing token" });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
        const meetings = await Meeting.find({ user_id: decoded.username, deleted: { $ne: true } }).sort({ date: -1 });
        res.json(meetings);
    } catch (e) {
        console.error("History Error:", e);
        res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};

export const addToHistory = async (req: Request, res: Response): Promise<void> => {
    const { token, meeting_code, title } = req.body;

    if (!token || typeof token !== "string") {
        res.status(401).json({ message: "Unauthorized: Missing token" });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };

        const newMeeting = new Meeting({
            user_id: decoded.username,
            meetingCode: meeting_code,
            ...(title ? { title } : {})
        });

        await newMeeting.save();
        res.status(201).json({ message: "Added code to history" });
    } catch (e) {
        console.error("Add History Error:", e);
        res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};

export const deleteFromHistory = async (req: Request, res: Response): Promise<void> => {
    const { token, meeting_code } = req.query;

    if (!token || typeof token !== "string") {
        res.status(401).json({ message: "Unauthorized: Missing token" });
        return;
    }

    if (!meeting_code || typeof meeting_code !== "string") {
        res.status(400).json({ message: "Please provide meeting_code" });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };

        await Meeting.updateMany(
            { user_id: decoded.username, meetingCode: meeting_code },
            { $set: { deleted: true } }
        );

        res.status(200).json({ message: "Deleted from history" });
    } catch (e) {
        console.error("Delete History Error:", e);
        res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};

export const clearHistory = async (req: Request, res: Response): Promise<void> => {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
        res.status(401).json({ message: "Unauthorized: Missing token" });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };

        await Meeting.updateMany(
            { user_id: decoded.username },
            { $set: { deleted: true } }
        );

        res.status(200).json({ message: "Cleared history" });
    } catch (e) {
        console.error("Clear History Error:", e);
        res.status(401).json({ message: "Unauthorized: Invalid token" });
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

        const meetingCount = await Meeting.countDocuments({ user_id: username });

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

    if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ message: "Please provide a name" });
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

    if (!currentPassword || !newPassword) {
        res.status(400).json({
            message: "Please provide your current and new password"
        });
        return;
    }

    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({
            message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`
        });
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
            res.status(401).json({ message: "Current password is incorrect" });
            return;
        }

        user.password = await bcrypt.hash(newPassword, 10);

        // Replaces the stored token so the caller's session stays valid while
        // any token issued before the change stops matching what we hold.
        const token = await issueToken(user);

        res.json({ message: "Password updated", token });
    } catch (e) {
        console.error("Change Password Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};