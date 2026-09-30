/**
 * Black-box tests: boots the real server against an in-memory MongoDB and
 * drives it over HTTP and Socket.IO, the way the client does.
 *
 *   bun test
 *
 * Tests share one server and database and run in file order. The auth rate
 * limit (20 per window per IP) counts every login/register/change_password
 * call below, so keep the "rate limiting" block last.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io, type Socket } from "socket.io-client";
import type { Subprocess } from "bun";

const PORT = 18_000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;
const USERS = `${BASE}/api/v1/users`;
const ORIGIN = "http://localhost:3000";
const APP = join(import.meta.dir, "..", "src", "app.ts");

let mongo: MongoMemoryServer;
let server: Subprocess;

const post = (path: string, body: unknown, token?: string) =>
    fetch(USERS + path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
    });

const get = (path: string, token?: string) =>
    fetch(USERS + path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

const del = (path: string, token: string) =>
    fetch(USERS + path, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });

const loginToken = async (username: string, password: string): Promise<string> => {
    const res = await post("/login", { username, password });
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Connection = { socket: Socket; ok: boolean; error?: string };

const openSockets: Socket[] = [];
const connect = (token?: string): Promise<Connection> =>
    new Promise((resolve) => {
        const socket = io(BASE, {
            auth: token ? { token } : {},
            transports: ["websocket"],
            reconnection: false
        });
        openSockets.push(socket);
        socket.on("connect", () => resolve({ socket, ok: true }));
        socket.on("connect_error", (e) => resolve({ socket, ok: false, error: e.message }));
    });

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();

    // Run from an empty directory so a developer's .env cannot leak in.
    server = Bun.spawn(["bun", APP], {
        cwd: mkdtempSync(join(tmpdir(), "beam-test-")),
        env: {
            ...process.env,
            PORT: String(PORT),
            MONGO_URI: mongo.getUri("beam"),
            JWT_SECRET: "test-secret",
            CLIENT_ORIGIN: ORIGIN,
            TRUST_PROXY: ""
        },
        stdout: "pipe",
        stderr: "inherit"
    });

    // Wait for the listen log line rather than polling the port.
    const reader = (server.stdout as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let output = "";
    while (!output.includes("LISTENING")) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`Server exited before listening:\n${output}`);
        output += decoder.decode(value);
    }
    reader.releaseLock();
}, 60_000);

afterAll(async () => {
    for (const socket of openSockets) socket.disconnect();
    server?.kill();
    await mongo?.stop();
});

describe("registration", () => {
    test("rejects a short password", async () => {
        const res = await post("/register", { name: "A", username: "short@x.io", password: "123" });
        expect(res.status).toBe(400);
    });

    test("rejects query operators in place of strings", async () => {
        const res = await post("/register", { name: "A", username: { $ne: null }, password: "secret1" });
        expect(res.status).toBe(400);
    });

    test("creates accounts, storing the email lowercased", async () => {
        expect((await post("/register", { name: "Alice", username: "Alice@X.io", password: "secret1" })).status).toBe(201);
        expect((await post("/register", { name: "Bob", username: "b@x.io", password: "secret2" })).status).toBe(201);
    });

    test("treats emails differing only in case as the same account", async () => {
        const res = await post("/register", { name: "Other", username: "ALICE@x.io", password: "secret3" });
        expect(res.status).toBe(409);
    });
});

describe("login", () => {
    test("gives unknown users and wrong passwords the same answer", async () => {
        const unknown = await post("/login", { username: "nobody@x.io", password: "whatever" });
        const wrong = await post("/login", { username: "alice@x.io", password: "wrongpw" });
        expect(unknown.status).toBe(401);
        expect(wrong.status).toBe(401);
        expect(await unknown.json()).toEqual(await wrong.json());
    });

    test("rejects a {$ne: null} username", async () => {
        const res = await post("/login", { username: { $ne: null }, password: "secret1" });
        expect(res.status).toBe(400);
    });

    test("ignores email case", async () => {
        const res = await post("/login", { username: "ALICE@X.IO", password: "secret1" });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { username: string }).username).toBe("alice@x.io");
    });
});

describe("history", () => {
    test("rejects a token in the query string", async () => {
        const token = await loginToken("alice@x.io", "secret1");
        const res = await fetch(`${USERS}/get_all_activity?token=${token}`);
        expect(res.status).toBe(401);
    });

    test("keeps one row per room and hides deleted rows from the profile count", async () => {
        const token = await loginToken("b@x.io", "secret2");

        await post("/add_to_activity", { meeting_code: "room-1", title: "Sync" }, token);
        await post("/add_to_activity", { meeting_code: "room-1" }, token);
        const history = (await (await get("/get_all_activity", token)).json()) as { title?: string }[];
        expect(history).toHaveLength(1);
        expect(history[0]?.title).toBe("Sync");

        await del("/delete_from_activity?meeting_code=room-1", token);
        const profile = (await (await get("/profile", token)).json()) as { meetingCount: number };
        expect(profile.meetingCount).toBe(0);
    });
});

describe("http hardening", () => {
    test("CORS does not allow other origins", async () => {
        const res = await fetch(`${USERS}/login`, {
            method: "OPTIONS",
            headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" }
        });
        expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
        expect(res.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
    });

    test("sends security headers", async () => {
        const res = await get("/profile");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("x-powered-by")).toBeNull();
    });
});

describe("signalling", () => {
    test("refuses sockets without a valid token", async () => {
        const anonymous = await connect();
        expect(anonymous.ok).toBe(false);
        expect(anonymous.error).toBe("Unauthorized");
        expect((await connect("not-a-jwt")).ok).toBe(false);
    });

    test("isolates rooms and stamps verified names", async () => {
        const [tokA, tokB] = await Promise.all([
            loginToken("alice@x.io", "secret1"),
            loginToken("b@x.io", "secret2")
        ]);
        const a = (await connect(tokA)).socket;
        const b = (await connect(tokB)).socket;
        const outsider = (await connect(tokA)).socket;

        const joins: unknown[][] = [];
        b.on("user-joined", (...args) => joins.push(args));
        a.emit("join-call", "room-x");
        await wait(100);
        b.emit("join-call", "room-x");
        outsider.emit("join-call", "room-z");
        await wait(100);

        const names = joins.at(-1)?.[2] as Record<string, string>;
        expect(names[a.id!]).toBe("Alice");
        expect(names[b.id!]).toBe("Bob");

        // Chat: the sender argument is ignored and oversized messages dropped.
        const chat: unknown[][] = [];
        b.on("chat-message", (...m) => chat.push(m));
        a.emit("chat-message", "hello", "Mallory the Admin");
        a.emit("chat-message", "x".repeat(5000));
        await wait(100);
        expect(chat).toEqual([["hello", "Alice", a.id]]);

        // Signals: relayed within a room, dropped across rooms.
        const signals: unknown[][] = [];
        a.on("signal", (...m) => signals.push(m));
        const payload = JSON.stringify({ state: { muted: true, videoOn: false } });
        outsider.emit("signal", a.id, payload);
        b.emit("signal", a.id, payload);
        await wait(100);
        expect(signals).toEqual([[b.id, payload]]);

        // Once a room empties, its chat is gone for the next meeting.
        a.disconnect();
        b.disconnect();
        await wait(150);
        const late = (await connect(tokB)).socket;
        const lateChat: unknown[] = [];
        late.on("chat-message", (...m) => lateChat.push(m));
        late.emit("join-call", "room-x");
        await wait(150);
        expect(lateChat).toHaveLength(0);
    });
});

describe("password change", () => {
    test("rejects a wrong current password without signing the user out", async () => {
        const token = await loginToken("alice@x.io", "secret1");
        const res = await post("/change_password", { currentPassword: "nope", newPassword: "newsecret1" }, token);
        expect(res.status).toBe(400);
        expect((await get("/profile", token)).status).toBe(200);
    });

    test("revokes every earlier token, on every device", async () => {
        const thisDevice = await loginToken("alice@x.io", "secret1");
        const otherDevice = await loginToken("alice@x.io", "secret1");

        const res = await post("/change_password", { currentPassword: "secret1", newPassword: "newsecret1" }, thisDevice);
        expect(res.status).toBe(200);
        const { token: fresh } = (await res.json()) as { token: string };

        expect((await get("/profile", thisDevice)).status).toBe(401);
        expect((await get("/profile", otherDevice)).status).toBe(401);
        expect((await get("/profile", fresh)).status).toBe(200);
        expect((await connect(otherDevice)).ok).toBe(false);
    });
});

describe("rate limiting", () => {
    test("throttles repeated login attempts", async () => {
        let status = 0;
        for (let i = 0; i < 25 && status !== 429; i++) {
            status = (await post("/login", { username: "alice@x.io", password: "bad" })).status;
        }
        expect(status).toBe(429);
    });
});
