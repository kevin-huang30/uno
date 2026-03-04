import { describe, test, expect } from 'bun:test';
import { Room } from '../game/Room.js';

function mockWs(id) {
  const sent = [];
  return {
    send(data) { sent.push(JSON.parse(data)); },
    _sent: sent,
    data: { playerId: id },
  };
}

describe('Room', () => {
  test('adding players up to 10', () => {
    const room = new Room('ABCD', 'host', 'Host');
    room.setSocket('host', mockWs('host'));

    for (let i = 1; i <= 9; i++) {
      const result = room.addPlayer(`p${i}`, `Player${i}`, mockWs(`p${i}`));
      expect(result.joined).toBe(true);
    }
    expect(room.playerCount).toBe(10);
  });

  test('rejecting 11th player', () => {
    const room = new Room('ABCD', 'host', 'Host');
    room.setSocket('host', mockWs('host'));

    for (let i = 1; i <= 9; i++) {
      room.addPlayer(`p${i}`, `Player${i}`, mockWs(`p${i}`));
    }

    const result = room.addPlayer('p10', 'Player10', mockWs('p10'));
    expect(result.error).toBeDefined();
  });

  test('removing players updates list', () => {
    const room = new Room('ABCD', 'host', 'Host');
    room.setSocket('host', mockWs('host'));
    room.addPlayer('p1', 'Player1', mockWs('p1'));

    expect(room.playerCount).toBe(2);
    room.removePlayer('p1');
    expect(room.playerCount).toBe(1);
  });

  test('host leaving transfers host to next player', () => {
    const room = new Room('ABCD', 'host', 'Host');
    room.setSocket('host', mockWs('host'));
    room.addPlayer('p1', 'Player1', mockWs('p1'));

    const result = room.removePlayer('host');
    expect(result.wasHost).toBe(true);
    expect(room.hostId).toBe('p1');
  });

  test('room status transitions: waiting -> playing -> finished', () => {
    const room = new Room('ABCD', 'host', 'Host');
    room.setSocket('host', mockWs('host'));
    room.addPlayer('p1', 'Player1', mockWs('p1'));

    expect(room.status).toBe('waiting');
    room.startGame();
    expect(room.status).toBe('playing');
  });

  test('cannot join a room that is already playing', () => {
    const room = new Room('ABCD', 'host', 'Host');
    room.setSocket('host', mockWs('host'));
    room.addPlayer('p1', 'Player1', mockWs('p1'));
    room.startGame();

    const result = room.addPlayer('p2', 'Player2', mockWs('p2'));
    expect(result.error).toBeDefined();
  });

  test('broadcast sends to all connected players', () => {
    const room = new Room('ABCD', 'host', 'Host');
    const ws1 = mockWs('host');
    const ws2 = mockWs('p1');
    room.setSocket('host', ws1);
    room.addPlayer('p1', 'Player1', ws2);

    room.broadcast({ type: 'test', data: 'hello' });
    expect(ws1._sent.length).toBe(1);
    expect(ws2._sent.length).toBe(1);
    expect(ws1._sent[0].type).toBe('test');
  });

  test('sendTo sends only to specified player', () => {
    const room = new Room('ABCD', 'host', 'Host');
    const ws1 = mockWs('host');
    const ws2 = mockWs('p1');
    room.setSocket('host', ws1);
    room.addPlayer('p1', 'Player1', ws2);

    room.sendTo('p1', { type: 'private', data: 'secret' });
    expect(ws1._sent.length).toBe(0);
    expect(ws2._sent.length).toBe(1);
    expect(ws2._sent[0].type).toBe('private');
  });
});
