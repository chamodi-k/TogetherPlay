# 🎬 TogetherPlay — Real-time Synchronized Video Watch Party Platform

> **Watch together. Even when you're apart.** ❤️

TogetherPlay allows multiple users to join private theater rooms and watch legally embeddable/authorized video sources (YouTube, direct MP4/WebM videos) with sub-second video synchronization, WebRTC camera & microphone calls, real-time live chat, floating reactions, and persistent state management.

---

## 🚀 Quick Start in VS Code (Windows)

### Option 1: One-Click Startup
Double click `start-dev.bat` or run in VS Code terminal:
```powershell
.\start-dev.bat
```

### Option 2: NPM Commands
1. **Install dependencies:**
   ```powershell
   npm run install:all
   ```
2. **Start both Server & Client concurrently:**
   ```powershell
   npm run dev
   ```
3. Open your browser:
   - **Frontend App:** [http://localhost:5173](http://localhost:5173)
   - **Backend API:** [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🗄️ Database Architecture (Oracle SQL / PL/SQL + Local Fallback)

TogetherPlay is engineered with a **Dual-Database Adapter**:
1. **Full Oracle Database Support**:
   - DDL & Stored Procedures script located at `server/database/oracle_schema.sql`.
   - Tables: `USERS`, `ROOMS`, `ROOM_MEMBERS`, `VIDEOS`, `MESSAGES`, `WATCH_HISTORY`.
   - To connect to Oracle, update `server/.env`:
     ```env
     DB_TYPE=oracle
     ORACLE_USER=your_oracle_user
     ORACLE_PASSWORD=your_oracle_password
     ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
     ```
2. **Zero-Config Development Fallback**:
   - If Oracle credentials are not set, the backend automatically initializes an embedded SQLite database (`server/data/togetherplay.sqlite`) using the identical relational schema and constraints, ensuring **instant zero-config startup in VS Code**.

---

## 🌟 Key Features

| Feature | Details |
| :--- | :--- |
| 🎬 **Video Synchronization Engine** | Synchronized Play, Pause, Seek, and Video Change across all participants. |
| ⏱️ **Clock Drift Correction** | Periodic heartbeat comparison; subtle playback rate tweaking for < 1.5s drift, hard seek for > 1.5s. |
| 🔄 **Initial Late-Join Sync** | Joining members automatically receive server-calculated current timestamp and playback status. |
| 📹 **WebRTC Video Calling** | Mesh peer-to-peer live camera and microphone streams using Google STUN servers. |
| 🎤 **Audio & Video Controls** | Mute/unmute microphone and turn camera on/off with live badge indicators. |
| 💬 **Live Chat** | Real-time chat messages persisted to the database. |
| ❤️ **Live Floating Reactions** | Animated floating emojis (❤️, 😂, 🔥, 😮, 👏) floating upwards across the video. |
| 👥 **Online Presence** | Real-time list of members currently inside the room. |
| 🔒 **Host Controls** | Host can toggle "Host Controls Only" mode to prevent other members from interrupting the movie. |
| 🔗 **Invite Link & 6-Char Code** | Easily invite friends with 6-character room codes (e.g. `AB7X92`) or shareable links. |

---

## 📁 Project Structure

```
Films/
├── client/                      # React + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/          # VideoPlayer, WebRTCGrid, ChatPanel, ReactionsOverlay, Navbar
│   │   ├── context/             # AuthContext
│   │   ├── pages/               # LandingPage, AuthPage, DashboardPage, RoomPage
│   │   ├── services/            # Axios API & Socket.IO client singleton
│   │   └── types/               # TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
├── server/                      # Node.js + Express + Socket.IO + Database
│   ├── data/                    # Embedded database storage
│   ├── database/
│   │   └── oracle_schema.sql    # Oracle DDL, constraints & PL/SQL procedures
│   ├── src/
│   │   ├── config/              # Universal DB adapter (Oracle + SQLite)
│   │   ├── controllers/         # Auth & Room controllers
│   │   ├── middleware/          # JWT authentication middleware
│   │   ├── routes/              # Express API routes
│   │   ├── sockets/             # Socket.IO sync engine, WebRTC signaling & reactions
│   │   └── server.js            # Server entry point
│   ├── .env
│   ├── .env.example
│   └── package.json
├── package.json                 # Monorepo concurrently launcher
├── start-dev.bat                # Windows 1-click launch script
└── README.md
```
