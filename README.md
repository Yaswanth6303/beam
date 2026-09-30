# Beam

A full-stack video meeting app: group calls over WebRTC, screen sharing, and in-call chat.

- **client/**: Next.js 16 + React 19 + Tailwind. The UI and the WebRTC peer connections.
- **server/**: Express + Socket.IO + MongoDB on Bun. Accounts, meeting history, and call signalling.

Calls are peer-to-peer (a full mesh). The server only relays signalling messages
and chat; audio and video never pass through it.

## Running locally

Requirements: [Bun](https://bun.sh) and MongoDB (local install or Docker).

```sh
# 1. Server
cd server
cp .env.example .env         # then set JWT_SECRET: openssl rand -hex 32
bun install
bun run dev                  # http://localhost:8000

# 2. Client (second terminal)
cd client
cp .env.example .env.local
bun install
bun run dev                  # http://localhost:3000
```

To try a call on one machine, open the app in two browser profiles (or one
normal and one private window) and sign in as two different users. Both
windows share the same localStorage session otherwise.

## Configuration

### server/.env

| Variable        | Required | Description |
| --------------- | -------- | ----------- |
| `MONGO_URI`     | yes      | MongoDB connection string. |
| `JWT_SECRET`    | yes      | Signs session tokens. The server refuses to start without it. |
| `PORT`          | no       | Defaults to `8000`. |
| `CLIENT_ORIGIN` | no       | Origins allowed to call the API and open sockets, comma-separated. Defaults to `http://localhost:3000`. |
| `TRUST_PROXY`   | no       | Set to `1` when behind one reverse proxy so rate limiting sees real client IPs. Leave unset otherwise. |

### client/.env.local

| Variable                      | Description |
| ----------------------------- | ----------- |
| `NEXT_PUBLIC_API_URL`         | Server base URL. Baked in at build time, so rebuild after changing it. |
| `NEXT_PUBLIC_TURN_URLS`       | Optional TURN relay URLs, comma-separated. |
| `NEXT_PUBLIC_TURN_USERNAME`   | TURN username. |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | TURN credential. Ships to the browser, so use short-lived credentials. |

## Testing

```sh
cd server
bun test        # boots the server against an in-memory MongoDB
bun run lint
bun run typecheck

cd client
bun run typecheck
bun run build
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull request.

## Deploying

- **Serve both apps over HTTPS.** Browsers only allow camera and microphone
  access on secure origins (localhost is the exception).
- **Configure a TURN server** (coturn, or a hosted provider such as Twilio or
  Metered). Without it, users behind strict NATs or corporate firewalls join
  calls but never connect media.
- **Set `CLIENT_ORIGIN`** to the deployed client URL, and `TRUST_PROXY=1` if
  the server sits behind Nginx or a load balancer.
- **Run a single server instance.** Rooms, chat, and rate limits live in
  memory; several instances would need Redis and the Socket.IO Redis adapter.
- **Upgrading an existing database?** Run the one-off migration first. It
  removes duplicate history rows so the new unique index can build:

  ```sh
  cd server && bun scripts/dedupe-meetings.ts
  ```

## Known limits

- Mesh calls work well up to about 4–6 people. Larger meetings need a media
  server (an SFU such as LiveKit or mediasoup).
- Anyone signed in who has a meeting code can join; there is no host control
  or waiting room.
- Sessions are stored in `localStorage`.
- There is no password reset.
