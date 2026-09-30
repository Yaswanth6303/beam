import type { Request, Response, NextFunction } from "express";

/**
 * Fixed-window, per-IP limiter held in memory. Enough for a single process;
 * a multi-instance deployment needs a shared store such as Redis instead.
 */
export const rateLimit = ({ windowMs, max }: { windowMs: number; max: number }) => {
    const hits = new Map<string, { count: number; resetAt: number }>();

    // Drop expired windows so the map does not grow with every IP ever seen.
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(key);
        }
    }, windowMs).unref();

    return (req: Request, res: Response, next: NextFunction): void => {
        const now = Date.now();
        const key = req.ip ?? "unknown";

        let entry = hits.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }

        entry.count++;
        if (entry.count > max) {
            res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
            res.status(429).json({ message: "Too many attempts, please try again later" });
            return;
        }

        next();
    };
};
