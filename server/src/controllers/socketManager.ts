import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { verifyToken } from "../middlewares/auth.middleware.js";
import type { AuthUser } from "../middlewares/auth.middleware.js";

const MAX_ROOM_CODE_LENGTH = 64;
const MAX_MESSAGE_LENGTH = 2000;
/** Chat kept per room for late joiners; older messages are dropped. */
const MAX_HISTORY = 200;
/** SDP offers run a few KB; this leaves generous headroom. */
const MAX_SIGNAL_LENGTH = 64 * 1024;

type SocketData = { user: AuthUser; room?: string };
type ChatEntry = { sender: string; data: string; socketIdSender: string };

/** Members of each room in join order, mapping socket id to display name. */
const rooms = new Map<string, Map<string, string>>();
const history = new Map<string, ChatEntry[]>();

export const connectToSocket = (server: HttpServer, clientOrigins: string[]): Server => {
    const io = new Server(server, {
        cors: {
            origin: clientOrigins,
            methods: ["GET", "POST"]
        },
        maxHttpBufferSize: 100 * 1024
    });

    // Only signed-in users may connect; the verified name is what peers see.
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (typeof token !== "string" || !token) {
            next(new Error("Unauthorized"));
            return;
        }

        try {
            const user = await verifyToken(token);
            if (!user) {
                next(new Error("Unauthorized"));
                return;
            }
            (socket.data as SocketData).user = user;
            next();
        } catch (e) {
            console.error("Socket Auth Error:", e);
            next(new Error("Internal server error"));
        }
    });

    io.on("connection", (socket) => {
        const socketId = socket.id;
        const data = socket.data as SocketData;

        socket.on("join-call", (path: unknown) => {
            // One room per connection; a repeat join would duplicate the member.
            if (data.room) return;
            if (typeof path !== "string" || !path || path.length > MAX_ROOM_CODE_LENGTH) return;

            let members = rooms.get(path);
            if (!members) {
                members = new Map();
                rooms.set(path, members);
            }
            members.set(socketId, data.user.name);
            data.room = path;
            void socket.join(path);

            io.to(path).emit(
                "user-joined",
                socketId,
                [...members.keys()],
                Object.fromEntries(members)
            );

            for (const msg of history.get(path) ?? []) {
                socket.emit("chat-message", msg.data, msg.sender, msg.socketIdSender);
            }
        });

        socket.on("signal", (toId: unknown, message: unknown) => {
            const room = data.room;
            if (!room || typeof toId !== "string" || typeof message !== "string") return;
            if (message.length > MAX_SIGNAL_LENGTH) return;
            // Relay only between members of the same room.
            if (!rooms.get(room)?.has(toId)) return;

            io.to(toId).emit("signal", socketId, message);
        });

        socket.on("chat-message", (text: unknown) => {
            const room = data.room;
            if (!room || typeof text !== "string") return;
            const trimmed = text.trim();
            if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return;

            const entry: ChatEntry = {
                sender: data.user.name,
                data: trimmed,
                socketIdSender: socketId
            };

            const log = history.get(room) ?? [];
            log.push(entry);
            if (log.length > MAX_HISTORY) log.shift();
            history.set(room, log);

            io.to(room).emit("chat-message", entry.data, entry.sender, socketId);
        });

        socket.on("disconnect", () => {
            const room = data.room;
            if (!room) return;

            const members = rooms.get(room);
            if (!members) return;

            members.delete(socketId);
            io.to(room).emit("user-left", socketId);

            // The meeting is over once everyone leaves; do not keep its chat.
            if (members.size === 0) {
                rooms.delete(room);
                history.delete(room);
            }
        });
    });

    return io;
};
