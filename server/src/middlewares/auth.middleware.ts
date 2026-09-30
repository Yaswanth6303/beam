import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import type { IUser } from "../models/user.model.js";

const secret = process.env.JWT_SECRET;
if (!secret) {
    // A guessable fallback would let anyone mint tokens, so refuse to start.
    throw new Error("JWT_SECRET is not defined in .env");
}
const JWT_SECRET: string = secret;

export type AuthUser = { id: string; username: string; name: string };

/** A request that has passed through `requireAuth`. */
export type AuthedRequest = Request & { user: AuthUser };

/** `tv` is the user's tokenVersion when the token was issued. */
type TokenPayload = { id: string; username: string; tv?: number };

export const signToken = (user: IUser): string =>
    jwt.sign(
        { id: user._id, username: user.username, tv: user.tokenVersion ?? 0 },
        JWT_SECRET,
        { expiresIn: "7d" }
    );

/**
 * Resolves a token to its user, or null when the token is invalid, expired,
 * or was issued before the user's last password change.
 */
export const verifyToken = async (token: string): Promise<AuthUser | null> => {
    let decoded: TokenPayload;
    try {
        decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    } catch {
        return null;
    }

    const user = await User.findOne({ username: decoded.username });
    if (!user || (user.tokenVersion ?? 0) !== (decoded.tv ?? 0)) return null;

    return { id: String(user._id), username: user.username, name: user.name };
};

/**
 * Reads a bearer token from the Authorization header and attaches the user to
 * the request. Tokens never travel in the URL, so they stay out of access logs.
 */
export const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) {
        res.status(401).json({ message: "Unauthorized: Missing token" });
        return;
    }

    try {
        const user = await verifyToken(token);
        if (!user) {
            res.status(401).json({ message: "Unauthorized: Invalid token" });
            return;
        }
        (req as AuthedRequest).user = user;
        next();
    } catch (e) {
        console.error("Auth Error:", e);
        res.status(500).json({ message: "Internal server error" });
    }
};
