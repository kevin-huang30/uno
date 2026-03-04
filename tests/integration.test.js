import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

let server;
const PORT = 3456;

class WSClient {
  constructor(ws) {
    this.ws = ws;
    this.messages = [];
    this.waiters = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (this.waiters.length > 0) {
        this.waiters.shift()(msg);
      } else {
        this.messages.push(msg);
      }
    });
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  nextMessage(timeout = 5000) {
    if (this.messages.length > 0) {
      return Promise.resolve(this.messages.shift());
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeout);
      this.waiters.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  close() {
    this.ws.close();
  }
}

async function createClient() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  return new WSClient(ws);
}

beforeAll(async () => {
  process.env.PORT = PORT;
  const mod = await import('../server.js');
  server = mod.server;
});

afterAll(() => {
  server?.stop();
});

describe('Integration: Lobby flow', () => {
  test('host creates room, joiner joins, both see player list', async () => {
    const host = await createClient();
    host.send({ type: 'host_game', name: 'Alice', rounds: 1 });
    const created = await host.nextMessage();

    expect(created.type).toBe('room_created');
    expect(created.code.length).toBe(4);
    expect(created.players.length).toBe(1);

    const joiner = await createClient();
    joiner.send({ type: 'join_game', name: 'Bob', code: created.code });

    const joinedMsg = await joiner.nextMessage();
    expect(joinedMsg.type).toBe('room_joined');
    expect(joinedMsg.players.length).toBe(2);

    const playerJoinedMsg = await host.nextMessage();
    expect(playerJoinedMsg.type).toBe('player_joined');
    expect(playerJoinedMsg.players.length).toBe(2);

    host.close();
    joiner.close();
  });

  test('host starts game, both receive game state with hands', async () => {
    const host = await createClient();
    host.send({ type: 'host_game', name: 'Alice', rounds: 1 });
    const created = await host.nextMessage();

    const joiner = await createClient();
    joiner.send({ type: 'join_game', name: 'Bob', code: created.code });
    await joiner.nextMessage(); // room_joined
    await host.nextMessage(); // player_joined

    host.send({ type: 'start_game' });

    const hostState = await host.nextMessage();
    const joinerState = await joiner.nextMessage();

    expect(hostState.type).toBe('game_started');
    expect(hostState.hand.length).toBeGreaterThanOrEqual(7);
    expect(hostState.topCard).toBeDefined();

    expect(joinerState.type).toBe('game_started');
    expect(joinerState.hand.length).toBeGreaterThanOrEqual(7);

    // Hands should be different (each player sees only their cards)
    const hostIds = hostState.hand.map(c => c.id).sort();
    const joinerIds = joinerState.hand.map(c => c.id).sort();
    expect(hostIds).not.toEqual(joinerIds);

    host.close();
    joiner.close();
  });
});

describe('Integration: Error handling', () => {
  test('invalid room code returns error', async () => {
    const client = await createClient();
    client.send({ type: 'join_game', name: 'Bob', code: 'ZZZZ' });
    const msg = await client.nextMessage();
    expect(msg.type).toBe('error');
    client.close();
  });

  test('playing out of turn returns error', async () => {
    const host = await createClient();
    host.send({ type: 'host_game', name: 'Alice', rounds: 1 });
    const created = await host.nextMessage();

    const joiner = await createClient();
    joiner.send({ type: 'join_game', name: 'Bob', code: created.code });
    await joiner.nextMessage();
    await host.nextMessage();

    host.send({ type: 'start_game' });
    const hostState = await host.nextMessage();
    const joinerState = await joiner.nextMessage();

    // Send play from joiner (who may or may not be current player)
    // Use a fake card ID to trigger "not your turn" or "card not found" error
    joiner.send({ type: 'play_card', cardId: 'fake_card' });
    const errMsg = await joiner.nextMessage();
    // Should be an error of some kind
    expect(errMsg.type).toBe('error');

    host.close();
    joiner.close();
  });
});

describe('Integration: Disconnect', () => {
  test('player disconnects mid-game, others are notified', async () => {
    const host = await createClient();
    host.send({ type: 'host_game', name: 'Alice', rounds: 1 });
    const created = await host.nextMessage();

    const joiner = await createClient();
    joiner.send({ type: 'join_game', name: 'Bob', code: created.code });
    await joiner.nextMessage();
    await host.nextMessage();

    host.send({ type: 'start_game' });
    await host.nextMessage();
    await joiner.nextMessage();

    joiner.close();

    const notification = await host.nextMessage();
    expect(notification.type).toBe('player_left');

    host.close();
  });
});
