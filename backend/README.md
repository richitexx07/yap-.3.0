# YAPÓ Chat - Servidor WebSocket

Servidor de mensajería interna: chat privado 1 a 1, chat grupal, estados online y escribiendo.

## Cómo correr

```bash
cd backend
npm install
npm start
```

Escucha por defecto en el puerto **3001**. Para otro puerto: `WS_PORT=3002 npm start`.

## Arquitectura

- **mensajes**: por sala (`roomId`), con `userId`, `userName`, `text`, `createdAt`.
- **usuarios**: identificados por `userId` + `userName` (auth vía mensaje `auth`).
- **rooms**: `id`, `name`, `type` (private | group), `participants` (Set de userId).

Eventos cliente → servidor: `auth`, `get_rooms`, `join_room`, `leave_room`, `message`, `typing`.
Eventos servidor → cliente: `auth_ok`, `rooms`, `room_joined`, `messages`, `message`, `presence`.

## Frontend

La app Next.js se conecta a `ws://<hostname>:3001` (o `NEXT_PUBLIC_WS_URL` si está definida). Ejecutá el backend antes de usar el chat.
