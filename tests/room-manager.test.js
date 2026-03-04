import { describe, test, expect } from 'bun:test';
import { RoomManager } from '../lobby/RoomManager.js';

function mockWs(id) {
  const sent = [];
  return {
    send(data) { sent.push(JSON.parse(data)); },
    _sent: sent,
    data: { playerId: id },
  };
}

describe('RoomManager', () => {
  test('creating a room returns a 4-character alphanumeric code', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('host', 'Host', mockWs('host'));
    expect(room.code.length).toBe(4);
    expect(/^[A-Z0-9]+$/.test(room.code)).toBe(true);
  });

  test('codes are unique across rooms', () => {
    const rm = new RoomManager();
    const codes = new Set();
    for (let i = 0; i < 50; i++) {
      const room = rm.createRoom(`host${i}`, `Host${i}`, mockWs(`host${i}`));
      expect(codes.has(room.code)).toBe(false);
      codes.add(room.code);
    }
  });

  test('joining with valid code succeeds', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('host', 'Host', mockWs('host'));
    const result = rm.joinRoom(room.code, 'p1', 'Player1', mockWs('p1'));
    expect(result.room).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  test('joining with invalid code fails', () => {
    const rm = new RoomManager();
    const result = rm.joinRoom('ZZZZ', 'p1', 'Player1', mockWs('p1'));
    expect(result.error).toBeDefined();
  });

  test('joining a full room fails', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('host', 'Host', mockWs('host'));

    for (let i = 1; i <= 9; i++) {
      rm.joinRoom(room.code, `p${i}`, `Player${i}`, mockWs(`p${i}`));
    }

    const result = rm.joinRoom(room.code, 'p10', 'Player10', mockWs('p10'));
    expect(result.error).toBeDefined();
  });

  test('deleting a room removes it from registry', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('host', 'Host', mockWs('host'));
    const code = room.code;

    rm.deleteRoom(code);
    expect(rm.getRoom(code)).toBeNull();
  });

  test('room cleanup after all players leave', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('host', 'Host', mockWs('host'));
    rm.joinRoom(room.code, 'p1', 'Player1', mockWs('p1'));

    rm.removePlayer('p1');
    rm.removePlayer('host');

    expect(rm.getRoom(room.code)).toBeNull();
  });
});
