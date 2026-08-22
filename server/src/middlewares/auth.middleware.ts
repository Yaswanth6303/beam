import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

export type AuthUser = { id: string; username: string };

/** A request that has passed through `requireAuth`. */
export type AuthedRequest = Request & { user: AuthUser };

/**
 * Reads a bearer token from the Authorization header and attaches the decoded
 * user to the request. The older /add_to_activity and /get_all_activity routes
 * still take the token in the body and query string respectively; new routes
 * use the header so tokens stay out of access logs.
 */
export const requireAuth = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) {
        res.status(401).json({ message: "Unauthorized: Missing token" });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
        (req as AuthedRequest).user = {
            id: decoded.id,
            username: decoded.username
        };
        next();
    } catch {
        res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};
