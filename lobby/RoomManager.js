import { Room } from '../game/Room.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> Room
    this.playerRooms = new Map(); // playerId -> code
  }

  createRoom(hostId, hostName, ws) {
    const code = this._generateCode();
    const room = new Room(code, hostId, hostName);
    room.setSocket(hostId, ws);
    this.rooms.set(code, room);
    this.playerRooms.set(hostId, code);
    return room;
  }

  joinRoom(code, playerId, name, ws) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      return { error: 'Room not found' };
    }

    const result = room.addPlayer(playerId, name, ws);
    if (result.error) return result;

    this.playerRooms.set(playerId, code.toUpperCase());
    return { room, ...result };
  }

  getRoom(code) {
    return this.rooms.get(code.toUpperCase()) || null;
  }

  getRoomByPlayer(playerId) {
    const code = this.playerRooms.get(playerId);
    if (!code) return null;
    return this.rooms.get(code) || null;
  }

  removePlayer(playerId) {
    const code = this.playerRooms.get(playerId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (!room) {
      this.playerRooms.delete(playerId);
      return null;
    }

    const result = room.removePlayer(playerId);
    this.playerRooms.delete(playerId);

    // Clean up empty rooms
    if (room.isEmpty && room.status !== 'playing') {
      this.rooms.delete(code);
    }

    return { room, code, ...result };
  }

  deleteRoom(code) {
    const room = this.rooms.get(code);
    if (room) {
      for (const p of room.players) {
        this.playerRooms.delete(p.id);
      }
      this.rooms.delete(code);
    }
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 to avoid confusion
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }
}
