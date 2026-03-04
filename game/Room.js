import { Game } from './Game.js';

export class Room {
  constructor(code, hostId, hostName) {
    this.code = code;
    this.hostId = hostId;
    this.players = [{ id: hostId, name: hostName }];
    this.sockets = new Map(); // playerId -> ws
    this.status = 'waiting'; // waiting, playing, finished
    this.game = null;
    this.totalRounds = 1;
    this.disconnectedPlayers = new Set();
    this.turnTimer = null;
    this.turnTimeLimit = 30000;
  }

  addPlayer(playerId, name, ws) {
    if (this.players.length >= 10) {
      return { error: 'Room is full (max 10 players)' };
    }
    if (this.status === 'playing') {
      // Check for reconnect
      const existing = this.players.find(p => p.id === playerId);
      if (existing) {
        this.sockets.set(playerId, ws);
        this.disconnectedPlayers.delete(playerId);
        return { reconnected: true };
      }
      return { error: 'Game is already in progress' };
    }
    this.players.push({ id: playerId, name });
    this.sockets.set(playerId, ws);
    return { joined: true };
  }

  removePlayer(playerId) {
    this.sockets.delete(playerId);
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return null;

    if (this.status === 'playing') {
      this.disconnectedPlayers.add(playerId);
      return { disconnected: true, wasHost: playerId === this.hostId };
    }

    this.players.splice(idx, 1);
    const wasHost = playerId === this.hostId;

    if (wasHost && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }

    return { removed: true, wasHost, newHostId: wasHost ? this.hostId : null };
  }

  setSocket(playerId, ws) {
    this.sockets.set(playerId, ws);
  }

  startGame() {
    if (this.players.length < 2) {
      return { error: 'Need at least 2 players' };
    }
    if (this.status === 'playing') {
      return { error: 'Game already in progress' };
    }

    this.status = 'playing';
    this.game = new Game([...this.players], this.totalRounds);
    const effects = this.game.startRound();
    return { started: true, effects };
  }

  broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    for (const [playerId, ws] of this.sockets) {
      if (playerId === excludeId) continue;
      try {
        ws.send(data);
      } catch (e) {
        // Socket might be closed
      }
    }
  }

  sendTo(playerId, message) {
    const ws = this.sockets.get(playerId);
    if (ws) {
      try {
        ws.send(JSON.stringify(message));
      } catch (e) {
        // Socket might be closed
      }
    }
  }

  get playerCount() {
    return this.players.length;
  }

  get isEmpty() {
    return this.sockets.size === 0;
  }

  getPlayerList() {
    return this.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.id === this.hostId,
      connected: !this.disconnectedPlayers.has(p.id),
    }));
  }
}
