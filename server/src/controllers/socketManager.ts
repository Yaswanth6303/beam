import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";

let connections: Record<string, string[]> = {};
let messages: Record<string, { sender: string; data: string; socketIdSender: string }[]> = {};
let timeOnline: Record<string, Date> = {};

export const connectToSocket = (server: HttpServer): Server => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });

    io.on("connection", (socket: Socket) => {
        const socketId = socket.id as string;

        socket.on("join-call", (path: string) => {
            if (connections[path] === undefined) {
                connections[path] = [];
            }
            connections[path].push(socketId);
            timeOnline[socketId] = new Date();

            for (const clientId of connections[path]) {
                if (clientId) {
                    io.to(clientId).emit("user-joined", socketId, connections[path]);
                }
            }

            if (messages[path] !== undefined) {
                for (const msg of messages[path]) {
                    if (msg) {
                        io.to(socketId).emit(
                            "chat-message",
                            msg.data,
                            msg.sender,
                            msg.socketIdSender
                        );
                    }
                }
            }
        });

        socket.on("signal", (toId: string, message: any) => {
            io.to(toId).emit("signal", socketId, message);
        });

        socket.on("chat-message", (data: string, sender: string) => {
            const [matchingRoom, found] = Object.entries(connections)
                .reduce<[string, boolean]>(([room, isFound], [roomKey, roomValue]) => {
                    if (!isFound && roomValue.includes(socketId)) {
                        return [roomKey, true];
                    }
                        return [room, isFound];
                    }, ['', false]);

            if (found) {
                if (messages[matchingRoom] === undefined) {
                    messages[matchingRoom] = [];
                }

                messages[matchingRoom].push({ sender, data, socketIdSender: socketId });

                const roomConnections = connections[matchingRoom];
                if (roomConnections) {
                    roomConnections.forEach((elem) => {
                        if (elem) {
                            io.to(elem).emit("chat-message", data, sender, socketId);
                        }
                    });
                }
            }
        });

        socket.on("disconnect", () => {
            const joinTime = timeOnline[socketId];
            if (joinTime) {
                let diffTime = Math.abs(joinTime.getTime() - new Date().getTime());
                delete timeOnline[socketId];
            }
            
            let key: string | undefined;

            for (const [k, v] of Object.entries(connections)) {
                if (v.includes(socketId)) {
                    key = k;
                    
                    const roomConnections = connections[key];
                    if (roomConnections) {
                        for (const clientId of roomConnections) {
                            if (clientId) {
                                io.to(clientId).emit('user-left', socketId);
                            }
                        }
                    }

                    let index = v.indexOf(socketId);
                    if (index > -1) {
                        v.splice(index, 1);
                    }

                    if (v.length === 0) {
                        delete connections[k];
                    }
                }
            }
        });
    });

    return io;
};
