/**
 * YAPÓ Chat - Servidor WebSocket
 * Arquitectura: mensajes, usuarios, rooms (privado 1 a 1 y grupal)
 * Estados: online, escribiendo (typing)
 */

import { WebSocketServer } from "ws";

const PORT = Number(process.env.WS_PORT) || 3001;

const wss = new WebSocketServer({ port: PORT });

const users = new Map();
const rooms = new Map();
const messagesByRoom = new Map();

function roomKey(roomId) {
  return roomId;
}

function getOrCreateRoom(roomId, name, type = "group") {
  let room = rooms.get(roomKey(roomId));
  if (!room) {
    room = {
      id: roomId,
      name: name || roomId,
      type: type,
      participants: new Set(),
    };
    rooms.set(roomKey(roomId), room);
    messagesByRoom.set(roomKey(roomId), []);
  }
  return room;
}

function addMessage(roomId, userId, userName, text) {
  const key = roomKey(roomId);
  const list = messagesByRoom.get(key) || [];
  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    roomId,
    userId,
    userName,
    text,
    createdAt: new Date().toISOString(),
  };
  list.push(message);
  messagesByRoom.set(key, list);
  return message;
}

function broadcastToRoom(roomId, payload, excludeUserId = null) {
  const room = rooms.get(roomKey(roomId));
  if (!room) return;
  const data = JSON.stringify(payload);
  for (const uid of room.participants) {
    const u = users.get(uid);
    if (u && u.ws && u.ws.readyState === 1 && uid !== excludeUserId) {
      u.ws.send(data);
    }
  }
}

function setUserPresence(userId, status) {
  const u = users.get(userId);
  if (u) {
    u.status = status;
    u.lastSeen = new Date().toISOString();
  }
}

function notifyPresence(userId, roomId, status) {
  const u = users.get(userId);
  if (!u) return;
  broadcastToRoom(roomId, {
    type: "presence",
    roomId,
    userId,
    userName: u.name,
    status,
  }, userId);
}

wss.on("connection", (ws, req) => {
  let currentUserId = null;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case "auth": {
          currentUserId = msg.userId;
          const name = msg.userName || `Usuario ${currentUserId}`;
          users.set(currentUserId, {
            id: currentUserId,
            name,
            ws,
            status: "online",
            lastSeen: new Date().toISOString(),
          });
          ws.send(JSON.stringify({ type: "auth_ok", userId: currentUserId }));
          break;
        }

        case "get_rooms": {
          if (!currentUserId) break;
          const list = [];
          for (const [rid, room] of rooms) {
            if (room.participants.has(currentUserId)) {
              const msgs = messagesByRoom.get(rid) || [];
              const last = msgs[msgs.length - 1];
              list.push({
                id: room.id,
                name: room.name,
                type: room.type,
                lastMessage: last
                  ? { text: last.text, createdAt: last.createdAt, userId: last.userId }
                  : null,
              });
            }
          }
          ws.send(JSON.stringify({ type: "rooms", rooms: list }));
          break;
        }

        case "join_room": {
          if (!currentUserId) break;
          const { roomId, roomName, roomType } = msg;
          const room = getOrCreateRoom(
            roomId || `room-${Date.now()}`,
            roomName,
            roomType || "group"
          );
          room.participants.add(currentUserId);
          setUserPresence(currentUserId, "online");
          const msgs = (messagesByRoom.get(roomKey(room.id)) || []).slice(-50);
          ws.send(JSON.stringify({ type: "room_joined", roomId: room.id }));
          ws.send(JSON.stringify({ type: "messages", roomId: room.id, messages: msgs }));
          broadcastToRoom(room.id, {
            type: "presence",
            userId: currentUserId,
            userName: users.get(currentUserId)?.name,
            status: "online",
          }, currentUserId);
          break;
        }

        case "leave_room": {
          if (!currentUserId) break;
          const room = rooms.get(roomKey(msg.roomId));
          if (room) {
            room.participants.delete(currentUserId);
            notifyPresence(currentUserId, msg.roomId, "offline");
          }
          break;
        }

        case "message": {
          if (!currentUserId) break;
          const { roomId, text } = msg;
          if (!roomId || !text || !text.trim()) break;
          const u = users.get(currentUserId);
          const message = addMessage(roomId, currentUserId, u?.name || currentUserId, text.trim());
          broadcastToRoom(roomId, { type: "message", message });
          break;
        }

        case "typing": {
          if (!currentUserId) break;
          const { roomId, isTyping } = msg;
          if (!roomId) break;
          notifyPresence(currentUserId, roomId, isTyping ? "typing" : "online");
          break;
        }

        default:
          break;
      }
    } catch (e) {
      console.error("WS message error", e);
    }
  });

  ws.on("close", () => {
    if (currentUserId) {
      setUserPresence(currentUserId, "offline");
      const u = users.get(currentUserId);
      if (u) u.ws = null;
      for (const [rid, room] of rooms) {
        if (room.participants.has(currentUserId)) {
          broadcastToRoom(rid, {
            type: "presence",
            roomId: rid,
            userId: currentUserId,
            userName: users.get(currentUserId)?.name,
            status: "offline",
          });
        }
      }
      users.delete(currentUserId);
    }
  });
});

console.log(`YAPÓ Chat WS listening on port ${PORT}`);
