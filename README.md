# Neobotai — Frontend

This repository contains the NeoBot single-page frontend. I updated the UI on branch `feat/ui/chat-index-redesign` to provide a modern, accessible chat interface.

Quick start (frontend-only):

1. Serve the files from any static server (live-server, http-server, or via a backend).
2. The frontend expects an API at the relative path `/api` with endpoints:
   - POST /api/auth  => { email, pass, mode } returns { success, uid }
   - POST /api/chat  => { message, uid } returns { reply }
   - GET  /api/history?uid=... => returns { chats: [{ user_message, ... }, ...] }

Local dev notes:
- It's recommended to proxy API requests during development. For example, if your backend runs on localhost:3000, use a dev server proxy so requests to `/api` are forwarded to `http://localhost:3000/api`.
- Avoid storing sensitive tokens in localStorage in production. Use httpOnly cookies / server sessions.

Security & accessibility improvements made:
- Replaced unsafe innerHTML usage with textContent/createTextNode to prevent XSS from server replies.
- All fetch calls now check `response.ok` and handle errors gracefully.
- Semantic markup and ARIA attributes added to improve screen reader support.

Next recommended steps:
- Add a README installation section for running the backend or provide a Docker-compose that starts both frontend and backend.
- Add CSP headers from the server side.
- Implement server-side input sanitization and authentication flows.
