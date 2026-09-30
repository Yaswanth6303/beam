// Must be the first import: ES modules evaluate imports before the importing
// module's body, so a later dotenv.config() call runs after other modules
// have already read process.env.
import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { connectToSocket } from "./controllers/socketManager.js";
import cors from "cors";
import helmet from "helmet";
import userRoutes from "./routes/users.routes.js";

// Comma-separated, e.g. "https://beam.example.com,http://localhost:3000".
const clientOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const app = express();
const server = createServer(app);
connectToSocket(server, clientOrigins);

// Behind a reverse proxy every request arrives from the proxy's IP, which would
// put all users in one rate-limit bucket. TRUST_PROXY=1 reads X-Forwarded-For
// from one proxy hop instead. Leave unset when clients connect directly, or
// anyone could spoof their IP with that header.
if (process.env.TRUST_PROXY) {
    app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

app.set("port", process.env.PORT || 8000);
app.use(helmet());
app.use(cors({ origin: clientOrigins }));
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

app.use("/api/v1/users", userRoutes);

const start = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) throw new Error("MONGO_URI is not defined in .env");

        const connectionDb = await mongoose.connect(mongoUri);
        console.log(`MONGO Connected DB Host: ${connectionDb.connection.host}`);

        server.listen(app.get("port"), () => {
            console.log(`LISTENING ON PORT ${app.get("port")}`);
        });
    } catch (error) {
        console.error("Failed to connect to database or start server", error);
        // Exit so a process manager such as pm2 restarts us instead of
        // leaving a process that can serve nothing.
        process.exit(1);
    }
};

start();
