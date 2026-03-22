# Reconnection & Move Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic game rejoin on page reload (with 4-card penalty) and server-driven center-screen move notifications for all players.

**Architecture:** Two additive features sharing a single new message type each. `NotificationBuilder` is a pure stateless module the server calls after each action. Reconnection uses `localStorage` to persist session identity across page loads, with the server swapping the socket reference on rejoin. Features are independent — notifications work without reconnection and vice versa.

**Tech Stack:** Bun runtime, vanilla JS (ES modules), `bun:test` for tests, WebSocket for real-time communication.

---

## File Map

| File | Status | Change |
|---|---|---|
| `protocol/messages.js` | Modify | Add 5 new constants |
| `game/NotificationBuilder.js` | **Create** | Pure notification text builder |
| `tests/notification-builder.test.js` | **Create** | Unit tests for NotificationBuilder |
| `game/Room.js` | Modify | Add `rejoinPlayer()`, `lastNotification`, `_emptyRoomTimer` |
| `tests/room.test.js` | Modify | Tests for `rejoinPlayer()` |
| `server.js` | Modify | `rejoin_game` handler, 5-min timer in `close()`, notifications on all actions |
| `public/index.html` | Modify | Add `<div id="notification">` |
| `public/css/style.css` | Modify | Notification styles + keyframe animation |
| `public/js/ws.js` | Modify | Send `rejoin_game` from localStorage on connect |
| `public/js/main.js` | Modify | Handle `rejoin_success`/`rejoin_failed`, save/clear localStorage |
| `public/js/screens/game.js` | Modify | `move_notification` handler + FIFO queue renderer |

---

## Task 1: Add Protocol Constants

**Files:**
- Modify: `protocol/messages.js`

- [ ] **Step 1: Add the new constants**

Edit `protocol/messages.js`. Add to the `C2S` object:
```js
REJOIN_GAME: 'rejoin_game',
```

Add to the `S2C` object:
```js
REJOIN_SUCCESS: 'rejoin_success',
REJOIN_FAILED: 'rejoin_failed',
MOVE_NOTIFICATION: 'move_notification',
PLAYER_REJOINED: 'player_rejoined',
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun run --eval "import('./protocol/messages.js').then(m => console.log(Object.keys(m.C2S), Object.keys(m.S2C)))"
```

Expected: prints key lists including `REJOIN_GAME`, `REJOIN_SUCCESS`, `REJOIN_FAILED`, `MOVE_NOTIFICATION`, `PLAYER_REJOINED`

- [ ] **Step 3: Commit**

```bash
git add protocol/messages.js
git commit -m "feat: add reconnection and notification protocol constants"
```

---

## Task 2: Create NotificationBuilder

**Files:**
- Create: `game/NotificationBuilder.js`
- Create: `tests/notification-builder.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/notification-builder.test.js`:

```js
import { describe, test, expect } from 'bun:test';
import { buildNotification } from '../game/NotificationBuilder.js';

function truncate(name) {
  return name.length > 20 ? name.slice(0, 20) + '…' : name;
}

describe('buildNotification', () => {
  test('play_number card returns normal type with card color', () => {
    const n = buildNotification({
      eventType: 'play_number',
      card: { color: 'red', value: '7' },
      playerName: 'Alice',
      nextPlayerName: 'Bob',
    });
    expect(n.type).toBe('normal');
    expect(n.cardColor).toBe('red');
    expect(n.text).toBe('Alice played Red 7');
    expect(n.subtext).toBe("Bob's turn →");
  });

  test('play_skip returns action type', () => {
    const n = buildNotification({
      eventType: 'play_skip',
      card: { color: 'blue', value: 'skip' },
      playerName: 'Alice',
      nextPlayerName: 'Charlie',
      affectedPlayerName: 'Bob',
    });
    expect(n.type).toBe('action');
    expect(n.cardColor).toBe('blue');
    expect(n.text).toBe('Alice played Blue Skip');
    expect(n.subtext).toBe("Bob's turn is skipped → Charlie's turn");
  });

  test('play_reverse returns action type', () => {
    const n = buildNotification({
      eventType: 'play_reverse',
      card: { color: 'green', value: 'reverse' },
      playerName: 'Alice',
      nextPlayerName: 'Bob',
    });
    expect(n.type).toBe('action');
    expect(n.cardColor).toBe('green');
    expect(n.text).toBe('Alice played Green Reverse');
    expect(n.subtext).toBe("Direction flipped → Bob's turn");
  });

  test('play_draw_two returns action type', () => {
    const n = buildNotification({
      eventType: 'play_draw_two',
      card: { color: 'yellow', value: 'draw_two' },
      playerName: 'Alice',
      nextPlayerName: 'Charlie',
      affectedPlayerName: 'Bob',
    });
    expect(n.type).toBe('action');
    expect(n.cardColor).toBe('yellow');
    expect(n.text).toBe('Alice played Yellow Draw 2');
    expect(n.subtext).toBe('Bob draws 2 and is skipped');
  });

  test('play_wild returns wild type with null cardColor', () => {
    const n = buildNotification({
      eventType: 'play_wild',
      card: { color: null, value: 'wild' },
      playerName: 'Alice',
      nextPlayerName: 'Bob',
      chosenColor: 'blue',
    });
    expect(n.type).toBe('wild');
    expect(n.cardColor).toBeNull();
    expect(n.text).toBe('Alice played Wild');
    expect(n.subtext).toBe("Chose Blue → Bob's turn");
  });

  test('play_wd4 returns wild type with null cardColor', () => {
    const n = buildNotification({
      eventType: 'play_wd4',
      card: { color: null, value: 'wild_draw_four' },
      playerName: 'Alice',
      nextPlayerName: 'Charlie',
      affectedPlayerName: 'Bob',
      chosenColor: 'red',
    });
    expect(n.type).toBe('wild');
    expect(n.cardColor).toBeNull();
    expect(n.text).toBe('Alice played Wild Draw Four');
    expect(n.subtext).toBe('Chose Red · Bob draws 4 and is skipped');
  });

  test('draw_card returns normal type', () => {
    const n = buildNotification({
      eventType: 'draw_card',
      playerName: 'Alice',
    });
    expect(n.type).toBe('normal');
    expect(n.cardColor).toBeNull();
    expect(n.text).toBe('Alice drew a card');
    expect(n.subtext).toBe("Alice's turn continues");
  });

  test('auto_draw returns normal type with timed out message', () => {
    const n = buildNotification({
      eventType: 'auto_draw',
      playerName: 'Alice',
      nextPlayerName: 'Bob',
    });
    expect(n.type).toBe('normal');
    expect(n.text).toBe("Alice's turn timed out");
    expect(n.subtext).toBe("Drew a card → Bob's turn");
  });

  test('call_uno returns uno type', () => {
    const n = buildNotification({
      eventType: 'call_uno',
      playerName: 'Alice',
    });
    expect(n.type).toBe('uno');
    expect(n.cardColor).toBeNull();
    expect(n.text).toBe('Alice called UNO!');
    expect(n.subtext).toBe('1 card remaining');
  });

  test('player_rejoined returns action type', () => {
    const n = buildNotification({
      eventType: 'player_rejoined',
      playerName: 'Alice',
    });
    expect(n.type).toBe('action');
    expect(n.cardColor).toBeNull();
    expect(n.text).toBe('Alice rejoined');
    expect(n.subtext).toBe('Drew 4 cards');
  });

  test('player name truncated at 20 chars', () => {
    const n = buildNotification({
      eventType: 'draw_card',
      playerName: 'VeryLongPlayerNameHere',  // 22 chars; slice(0,20) = 'VeryLongPlayerNameHe'
    });
    expect(n.text).toBe('VeryLongPlayerNameHe… drew a card');
  });

  test('card color capitalized in text', () => {
    const n = buildNotification({
      eventType: 'play_number',
      card: { color: 'yellow', value: '0' },
      playerName: 'Bob',
      nextPlayerName: 'Alice',
    });
    expect(n.text).toBe('Bob played Yellow 0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun test tests/notification-builder.test.js
```

Expected: FAIL — `Cannot find module '../game/NotificationBuilder.js'`

- [ ] **Step 3: Implement NotificationBuilder**

Create `game/NotificationBuilder.js`:

```js
function truncateName(name) {
  if (name.length > 20) return name.slice(0, 20) + '…';
  return name;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function buildNotification({
  eventType,
  card = null,
  playerName,
  nextPlayerName = null,
  affectedPlayerName = null,
  chosenColor = null,
}) {
  const name = truncateName(playerName);
  const cardColor = card?.color ?? null;
  const colorLabel = capitalize(cardColor);
  const chosenLabel = capitalize(chosenColor);

  switch (eventType) {
    case 'play_number':
      return {
        text: `${name} played ${colorLabel} ${card.value}`,
        subtext: `${nextPlayerName}'s turn →`,
        cardColor,
        type: 'normal',
      };

    case 'play_skip':
      return {
        text: `${name} played ${colorLabel} Skip`,
        subtext: `${affectedPlayerName}'s turn is skipped → ${nextPlayerName}'s turn`,
        cardColor,
        type: 'action',
      };

    case 'play_reverse':
      return {
        text: `${name} played ${colorLabel} Reverse`,
        subtext: `Direction flipped → ${nextPlayerName}'s turn`,
        cardColor,
        type: 'action',
      };

    case 'play_draw_two':
      return {
        text: `${name} played ${colorLabel} Draw 2`,
        subtext: `${affectedPlayerName} draws 2 and is skipped`,
        cardColor,
        type: 'action',
      };

    case 'play_wild':
      return {
        text: `${name} played Wild`,
        subtext: `Chose ${chosenLabel} → ${nextPlayerName}'s turn`,
        cardColor: null,
        type: 'wild',
      };

    case 'play_wd4':
      return {
        text: `${name} played Wild Draw Four`,
        subtext: `Chose ${chosenLabel} · ${affectedPlayerName} draws 4 and is skipped`,
        cardColor: null,
        type: 'wild',
      };

    case 'draw_card':
      return {
        text: `${name} drew a card`,
        subtext: `${name}'s turn continues`,
        cardColor: null,
        type: 'normal',
      };

    case 'auto_draw':
      return {
        text: `${name}'s turn timed out`,
        subtext: `Drew a card → ${nextPlayerName}'s turn`,
        cardColor: null,
        type: 'normal',
      };

    case 'call_uno':
      return {
        text: `${name} called UNO!`,
        subtext: '1 card remaining',
        cardColor: null,
        type: 'uno',
      };

    case 'player_rejoined':
      return {
        text: `${name} rejoined`,
        subtext: 'Drew 4 cards',
        cardColor: null,
        type: 'action',
      };

    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun test tests/notification-builder.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add game/NotificationBuilder.js tests/notification-builder.test.js
git commit -m "feat: add NotificationBuilder for move announcements"
```

---

## Task 3: Add `rejoinPlayer()` to Room

**Files:**
- Modify: `game/Room.js`
- Modify: `tests/room.test.js`

- [ ] **Step 1: Write the failing tests**

Add to the `describe('Room', ...)` block in `tests/room.test.js`:

```js
describe('rejoinPlayer', () => {
  test('swaps socket and removes from disconnectedPlayers', () => {
    const room = new Room('ABCD', 'host', 'Host');
    const ws1 = mockWs('host');
    const ws2 = mockWs('p1');
    room.setSocket('host', ws1);
    room.addPlayer('p1', 'Player1', ws2);
    room.startGame();

    // Simulate disconnect
    room.disconnectedPlayers.add('p1');
    room.sockets.delete('p1');

    // Rejoin with new socket
    const ws3 = { send: () => {}, data: {} };
    room.rejoinPlayer('p1', ws3);

    expect(room.disconnectedPlayers.has('p1')).toBe(false);
    expect(room.sockets.get('p1')).toBe(ws3);
  });

  test('sets ws.data fields on new socket', () => {
    const room = new Room('ABCD', 'host', 'Host');
    const ws1 = mockWs('host');
    const ws2 = mockWs('p1');
    room.setSocket('host', ws1);
    room.addPlayer('p1', 'Player1', ws2);
    room.startGame();

    const ws3 = { send: () => {}, data: {} };
    room.rejoinPlayer('p1', ws3);

    expect(ws3.data.playerId).toBe('p1');
    expect(ws3.data.name).toBe('Player1');
    expect(ws3.data.roomCode).toBe('ABCD');
  });

  test('returns the player object', () => {
    const room = new Room('ABCD', 'host', 'Host');
    room.setSocket('host', mockWs('host'));
    room.addPlayer('p1', 'Player1', mockWs('p1'));
    room.startGame();

    const ws3 = { send: () => {}, data: {} };
    const player = room.rejoinPlayer('p1', ws3);

    expect(player.id).toBe('p1');
    expect(player.name).toBe('Player1');
  });

  test('initialises lastNotification to null', () => {
    const room = new Room('ABCD', 'host', 'Host');
    expect(room.lastNotification).toBeNull();
  });

  test('initialises _emptyRoomTimer to null', () => {
    const room = new Room('ABCD', 'host', 'Host');
    expect(room._emptyRoomTimer).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun test tests/room.test.js
```

Expected: FAIL — `room.rejoinPlayer is not a function`, `room.lastNotification is not null` etc.

- [ ] **Step 3: Implement in Room.js**

In `game/Room.js`, add to the `constructor`:
```js
this.lastNotification = null;
this._emptyRoomTimer = null;
```

Add the new method after `setSocket`:
```js
rejoinPlayer(playerId, ws) {
  const player = this.players.find(p => p.id === playerId);
  this.sockets.set(playerId, ws);
  this.disconnectedPlayers.delete(playerId);
  ws.data.playerId = playerId;
  ws.data.name = player.name;
  ws.data.roomCode = this.code;
  return player;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun test tests/room.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun test
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add game/Room.js tests/room.test.js
git commit -m "feat: add rejoinPlayer() method and session fields to Room"
```

---

## Task 4: Add `rejoin_game` Handler and 5-Minute Timer to server.js

**Files:**
- Modify: `server.js`

Note: `RoomManager` already has `getRoom(code)` (which calls `.toUpperCase()`) and `deleteRoom(code)` — use `getRoom()` directly, no new method needed.

- [ ] **Step 1: Add import for NotificationBuilder at the top of server.js**

Add after the existing imports:
```js
import { buildNotification } from './game/NotificationBuilder.js';
```

- [ ] **Step 2: Add REJOIN_GAME to the handleMessage switch**

In the `switch (msg.type)` block inside `handleMessage`, add before `default`:
```js
case C2S.REJOIN_GAME:
  handleRejoinGame(ws, msg);
  break;
```

- [ ] **Step 3: Add the handleRejoinGame function**

Add this function after `handlePlayAgain`:

```js
function handleRejoinGame(ws, msg) {
  // CRITICAL: use msg.playerId, NOT ws.data.playerId
  // ws.data.playerId is a freshly assigned ID for this new socket and is irrelevant
  const { playerId, roomCode, name } = msg;
  if (!playerId || !roomCode) return sendError(ws, 'Missing playerId or roomCode');

  const room = roomManager.getRoom(roomCode);
  if (!room || room.status !== 'playing') {
    ws.send(JSON.stringify({
      type: S2C.REJOIN_FAILED,
      reason: room ? 'game_not_active' : 'room_not_found',
    }));
    return;
  }

  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    ws.send(JSON.stringify({ type: S2C.REJOIN_FAILED, reason: 'player_not_found' }));
    return;
  }

  // Swap socket and update ws.data
  room.rejoinPlayer(playerId, ws);

  // Cancel empty-room timer if it was running
  if (room._emptyRoomTimer) {
    clearTimeout(room._emptyRoomTimer);
    room._emptyRoomTimer = null;
  }

  // Update RoomManager lookup so subsequent moves work
  // (old entry keyed on the stale new-socket ID is harmless — it was never added)
  roomManager.playerRooms.set(playerId, roomCode.toUpperCase());

  // Deal 4 penalty cards
  room.game.hands[playerId].push(...room.game.deck.draw(4));

  // Notify others
  room.broadcast({
    type: S2C.PLAYER_REJOINED,
    playerId,
    playerName: name,
    penaltyCards: 4,
    cardCount: room.game.getHand(playerId).length,
  }, playerId);

  // Build and broadcast rejoin notification
  const notification = buildNotification({ eventType: 'player_rejoined', playerName: name });
  room.lastNotification = notification;
  room.broadcast({ type: S2C.MOVE_NOTIFICATION, ...notification }, playerId);

  // Send full game state to the rejoining player
  ws.send(JSON.stringify({
    type: S2C.REJOIN_SUCCESS,
    ...room.game.getGameState(playerId),
    lastNotification: room.lastNotification,
  }));
}
```

- [ ] **Step 4: Add 5-minute empty-room timer to the close() handler**

In the `close(ws)` websocket handler, after the `result.room.broadcast(...)` for the `disconnected: true` case, add:

```js
// If all players disconnected during a game, delete the room after 5 minutes
if (result.disconnected && result.room.disconnectedPlayers.size === result.room.players.length) {
  result.room._emptyRoomTimer = setTimeout(() => {
    roomManager.deleteRoom(result.code);
  }, 5 * 60 * 1000);
}
```

The full updated `close(ws)` block should look like:
```js
close(ws) {
  const playerId = ws.data.playerId;
  const result = roomManager.removePlayer(playerId);
  if (result && result.room) {
    if (result.disconnected) {
      result.room.broadcast({
        type: S2C.PLAYER_LEFT,
        playerId,
        playerName: ws.data.name,
        disconnected: true,
      });
      // 5-minute cleanup if everyone is gone
      if (result.room.disconnectedPlayers.size === result.room.players.length) {
        result.room._emptyRoomTimer = setTimeout(() => {
          roomManager.deleteRoom(result.code);
        }, 5 * 60 * 1000);
      }
    } else {
      result.room.broadcast({
        type: S2C.PLAYER_LEFT,
        playerId,
        playerName: ws.data.name,
        players: result.room.getPlayerList(),
      });
      if (result.wasHost && result.newHostId) {
        result.room.broadcast({
          type: S2C.HOST_CHANGED,
          hostId: result.newHostId,
        });
      }
    }

    // Clean up empty non-playing rooms
    if (result.room.isEmpty && result.room.status !== 'playing') {
      roomManager.deleteRoom(result.code);
    }
  }
},
```

- [ ] **Step 5: Start the server to verify no startup errors**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun run server.js &
sleep 1 && curl -s http://localhost:3000/ | head -5
kill %1
```

Expected: returns HTML (the index.html page), no crash

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun test
```

Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "feat: add rejoin_game handler and 5-minute empty-room cleanup"
```

---

## Task 5: Add Notifications to All Server Action Handlers

**Files:**
- Modify: `server.js`

This task wires `buildNotification` + `room.lastNotification` + `MOVE_NOTIFICATION` broadcast after each game action. A helper function keeps it DRY.

- [ ] **Step 1: Add a sendNotification helper function**

Add this function near the other helpers at the bottom of `server.js`:

```js
function sendNotification(room, notifParams) {
  const notification = buildNotification(notifParams);
  if (!notification) return;
  room.lastNotification = notification;
  room.broadcast({ type: S2C.MOVE_NOTIFICATION, ...notification });
}
```

- [ ] **Step 2: Wire notifications into handlePlayCard**

In `handlePlayCard`, the card and result are already available. Add `sendNotification` calls at the right points.

After the `broadcastTurnChange(room)` call (the normal play path), add:

```js
// Determine eventType from the played card
const card = result.played;
let eventType;
if (card.value === 'skip') eventType = 'play_skip';
else if (card.value === 'reverse') eventType = 'play_reverse';
else if (card.value === 'draw_two') eventType = 'play_draw_two';
else if (card.value === 'wild') eventType = 'play_wild';
else if (card.value === 'wild_draw_four') eventType = 'play_wd4';
else eventType = 'play_number';

const currentPlayer = room.players.find(p => p.id === playerId);
const nextPlayer = room.game.getCurrentPlayer();
const affectedPlayer = result.effects?.skippedPlayer
  ? room.players.find(p => p.id === result.effects.skippedPlayer)
  : result.effects?.drewCards
  ? room.players.find(p => p.id === result.effects.drewCards.playerId)
  : null;

sendNotification(room, {
  eventType,
  card,
  playerName: currentPlayer?.name ?? ws.data.name,
  nextPlayerName: nextPlayer?.name,
  affectedPlayerName: affectedPlayer?.name ?? null,
  chosenColor: result.chosenColor ?? null,
});
```

Note: For wild cards, `result.chosenColor` is only available after `handleChooseColor` is called — so for `play_wild` and `play_wd4`, the notification fires in `handleChooseColor` instead. In `handlePlayCard`, skip notification if `result.needsColor` is true:

```js
if (result.needsColor) {
  room.sendTo(playerId, { type: S2C.WAITING_FOR_COLOR });
  return;  // notification will fire from handleChooseColor
}
```

- [ ] **Step 3: Wire notifications into handleChooseColor**

In `handleChooseColor`, place the `sendNotification` call **after** the entire `if (result.awaitingChallenge) { ... } else { ... }` block — not inside either branch — so it fires for both Wild and Wild Draw Four:

```js
if (result.awaitingChallenge) {
  room.sendTo(result.targetId, {
    type: S2C.DRAW_PENALTY,
    canChallenge: true,
    fromPlayerId: playerId,
  });
} else {
  broadcastTurnChange(room);
  startTurnTimer(room);
}

// Notification fires for BOTH wild and wd4 — must be outside the if/else
const currentPlayer = room.players.find(p => p.id === playerId);
const nextPlayer = room.game.getCurrentPlayer();
const affectedPlayerId = result.awaitingChallenge ? result.targetId : null;
const affectedPlayer = affectedPlayerId
  ? room.players.find(p => p.id === affectedPlayerId)
  : null;
const topCard = room.game.topCard;
const eventType = topCard.value === 'wild_draw_four' ? 'play_wd4' : 'play_wild';

sendNotification(room, {
  eventType,
  card: topCard,
  playerName: currentPlayer?.name ?? ws.data.name,
  nextPlayerName: nextPlayer?.name,
  affectedPlayerName: affectedPlayer?.name ?? null,
  chosenColor: result.color,
});
```

- [ ] **Step 4: Wire notifications into handleDrawCard**

In `handleDrawCard`, after the existing broadcasts and before the turn-advance path, add:

```js
if (result.playable) {
  room.sendTo(playerId, { type: S2C.DRAWN_CARD_PLAYABLE, card: result.card });
  // notification fires when they play or keep
} else {
  sendNotification(room, {
    eventType: 'draw_card',
    playerName: ws.data.name,
    nextPlayerName: room.game.getCurrentPlayer()?.name,
  });
  broadcastTurnChange(room);
  startTurnTimer(room);
}
```

Replace the existing `if (result.playable)` block with the above.

- [ ] **Step 5: Wire notification into handleKeepCard**

In `handleKeepCard`, after `broadcastTurnChange`:

```js
sendNotification(room, {
  eventType: 'draw_card',
  playerName: ws.data.name,
  nextPlayerName: room.game.getCurrentPlayer()?.name,
});
```

- [ ] **Step 6: Wire notification into handleCallUno**

In `handleCallUno`, after `room.broadcast({ type: S2C.UNO_CALLED, ... })`:

```js
sendNotification(room, {
  eventType: 'call_uno',
  playerName: ws.data.name,
});
```

- [ ] **Step 7: Wire auto_draw notification into startTurnTimer**

In `startTurnTimer`, after `broadcastTurnChange(room)` inside the timeout callback, add:

```js
const nextPlayer = room.game.getCurrentPlayer();
sendNotification(room, {
  eventType: 'auto_draw',
  playerName: currentPlayer.name,
  nextPlayerName: nextPlayer?.name,
});
```

- [ ] **Step 8: Start the server and verify no runtime errors**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun run server.js &
sleep 1 && curl -s http://localhost:3000/ | head -3
kill %1
```

Expected: returns HTML, no crash

- [ ] **Step 9: Run full test suite**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun test
```

Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add server.js
git commit -m "feat: broadcast move_notification after each game action"
```

---

## Task 6: Client — Session Persistence (ws.js + main.js)

**Files:**
- Modify: `public/js/ws.js`
- Modify: `public/js/main.js`

- [ ] **Step 1: Update ws.js to send rejoin_game on connect if session exists**

In `ws.js`, replace the `ws.onopen` handler:

```js
ws.onopen = () => {
  reconnectAttempts = 0;
  // If a session exists in localStorage, attempt to rejoin
  const raw = localStorage.getItem('uno_session');
  if (raw) {
    try {
      const session = JSON.parse(raw);
      ws.send(JSON.stringify({ type: 'rejoin_game', ...session }));
      return; // wait for rejoin_success or rejoin_failed
    } catch {
      localStorage.removeItem('uno_session');
    }
  }
};
```

- [ ] **Step 2: Update main.js to save session on join**

In `main.js`, in the `detectPlayerId` function, after `myPlayerId` is set and screens are initialised, save the session. This requires access to `roomCode` and `name`, which come from the message. Refactor `detectPlayerId` to accept the full message:

The function already receives `msg`. Update the `room_created` and `room_joined` branches:

```js
function detectPlayerId(msg) {
  if (myPlayerId) return;

  if (msg.type === 'room_created' && msg.players) {
    const host = msg.players.find(p => p.isHost);
    if (host) myPlayerId = host.id;
  } else if (msg.type === 'room_joined' && msg.players) {
    myPlayerId = msg.players[msg.players.length - 1].id;
  }

  if (myPlayerId && !initialized) {
    lobbyScreen.init(myPlayerId);
    gameScreen.init(myPlayerId);
    initialized = true;
  }

  // Save session after joining
  if (myPlayerId && (msg.type === 'room_created' || msg.type === 'room_joined')) {
    localStorage.setItem('uno_session', JSON.stringify({
      playerId: myPlayerId,
      roomCode: msg.code,
      name: msg.players?.find(p => p.id === myPlayerId)?.name ?? '',
    }));
  }
}
```

- [ ] **Step 3: Handle rejoin_success in the connect() switch**

In the `connect((msg) => { switch(msg.type) ... })` block, add:

```js
case 'rejoin_success':
  // myPlayerId comes from localStorage session, set it here
  if (!myPlayerId) {
    try {
      const raw = localStorage.getItem('uno_session');
      if (raw) {
        const session = JSON.parse(raw);
        myPlayerId = session.playerId;
        if (!initialized) {
          lobbyScreen.init(myPlayerId);
          gameScreen.init(myPlayerId);
          initialized = true;
        }
      }
    } catch {
      localStorage.removeItem('uno_session');
    }
  }
  gameScreen.updateGameState(msg);
  window.showScreen('game');
  if (msg.lastNotification) {
    gameScreen.handleMessage({ type: 'move_notification', ...msg.lastNotification });
  }
  break;

case 'rejoin_failed':
  showToast('Your game is no longer available', 'error');
  localStorage.removeItem('uno_session');
  window.showScreen('start');
  break;
```

- [ ] **Step 4: Clear session on intentional leave**

The `player_left` broadcast from `handleLeaveGame` is sent to remaining players only (the leaver's socket is already removed from `room.sockets`), so the leaving player never receives it. Clear localStorage immediately at the point of sending `leave_game`.

In `public/js/screens/lobby.js`, find the button click handler that calls `send({ type: 'leave_game' })` and add the clear immediately before or after it:
```js
localStorage.removeItem('uno_session');
send({ type: C2S.LEAVE_GAME });
```

Also handle `PLAYER_REJOINED` routing in the `connect()` switch in `main.js`:
```js
case 'player_rejoined':
  gameScreen.handleMessage(msg);
  break;
```

Also add `PLAYER_REJOINED` handling to pass to gameScreen:
```js
case 'player_rejoined':
  gameScreen.handleMessage(msg);
  break;
```

- [ ] **Step 5: Commit**

```bash
git add public/js/ws.js public/js/main.js
git commit -m "feat: persist session to localStorage and handle rejoin flow on client"
```

---

## Task 7: Notification DOM and CSS

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/style.css`

- [ ] **Step 1: Add the notification div to index.html**

Inside `<div id="app">`, just before the `<!-- Toast container -->` line, add:

```html
<!-- Move notification -->
<div id="notification" class="notification" style="display:none">
  <div class="notification-inner">
    <div class="notification-text"></div>
    <div class="notification-subtext"></div>
  </div>
</div>
```

- [ ] **Step 2: Add notification styles to style.css**

Append to `public/css/style.css`:

```css
/* ===== Move Notification ===== */
.notification {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 200;
  pointer-events: none;
  min-width: 240px;
  max-width: 480px;
}

.notification-inner {
  border-radius: 16px;
  padding: 18px 32px;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0,0,0,0.35);
}

/* Gradient banner (normal / action / wild) */
.notification.type-normal .notification-inner,
.notification.type-action .notification-inner,
.notification.type-wild .notification-inner {
  background: linear-gradient(135deg, var(--notif-color-a), var(--notif-color-b));
}

.notification-text {
  font-size: 20px;
  font-weight: 800;
  color: white;
  letter-spacing: -0.3px;
}

.notification-subtext {
  font-size: 13px;
  color: rgba(255,255,255,0.8);
  margin-top: 4px;
}

/* Card colour themes */
.notification.color-red    { --notif-color-a: #e53e3e; --notif-color-b: #c53030; }
.notification.color-blue   { --notif-color-a: #3182ce; --notif-color-b: #2b6cb0; }
.notification.color-green  { --notif-color-a: #38a169; --notif-color-b: #276749; }
.notification.color-yellow { --notif-color-a: #d69e2e; --notif-color-b: #b7791f; }
.notification.color-null   { --notif-color-a: #553c9a; --notif-color-b: #ee4b6a; }

/* UNO outlined style */
.notification.type-uno .notification-inner {
  background: transparent;
  border: 2px solid #ff4444;
}
.notification.type-uno .notification-text {
  color: #ff4444;
}
.notification.type-uno .notification-subtext {
  color: rgba(255,68,68,0.8);
}

/* Animations */
@keyframes notifFadeIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes notifFadeOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.92); }
}

@keyframes notifPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.notification.anim-in {
  animation: notifFadeIn 0.2s ease forwards;
}

.notification.anim-out {
  animation: notifFadeOut 0.2s ease forwards;
}

.notification.type-uno.anim-in {
  animation: notifPulse 0.5s ease 3, notifFadeOut 0.2s ease 1.5s forwards;
}
```

- [ ] **Step 3: Verify the HTML is valid**

Open `http://localhost:3000` in a browser (or just grep for the div):

```bash
grep -n 'id="notification"' /Users/kevinhuang/Documents/GitHub/uno/public/index.html
```

Expected: prints the line number with the new div

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/css/style.css
git commit -m "feat: add notification DOM element and CSS styles"
```

---

## Task 8: Client Notification Renderer in game.js

**Files:**
- Modify: `public/js/screens/game.js`

- [ ] **Step 1: Add notification queue and renderer**

At the top of `game.js` (after existing variable declarations), add:

```js
// Notification queue
const notifQueue = [];
let notifActive = false;
```

Add this function anywhere in the file (before `handleMessage`):

```js
function showNotification({ text, subtext, cardColor, type }) {
  notifQueue.push({ text, subtext, cardColor, type });
  if (!notifActive) _drainNotifQueue();
}

function _drainNotifQueue() {
  if (notifQueue.length === 0) {
    notifActive = false;
    return;
  }
  notifActive = true;
  const { text, subtext, cardColor, type } = notifQueue.shift();

  const el = document.getElementById('notification');
  const textEl = el.querySelector('.notification-text');
  const subtextEl = el.querySelector('.notification-subtext');

  // Reset classes
  el.className = 'notification';
  el.classList.add(`type-${type}`);
  el.classList.add(`color-${cardColor}`);  // color-null for null

  textEl.textContent = text;
  subtextEl.textContent = subtext ?? '';

  el.style.display = 'block';
  el.classList.add('anim-in');

  // Duration: uno uses CSS animation (1.5s pulse + 0.2s fadeout), others use 2.5s hold
  const holdMs = type === 'uno' ? 1700 : 2500;

  setTimeout(() => {
    el.classList.remove('anim-in');
    el.classList.add('anim-out');
    setTimeout(() => {
      el.style.display = 'none';
      el.className = 'notification';
      _drainNotifQueue();
    }, 200);
  }, holdMs);
}
```

- [ ] **Step 2: Handle move_notification and player_rejoined in handleMessage**

In the `handleMessage(msg)` function (or the switch block that routes messages), add:

```js
case 'move_notification':
  showNotification(msg);
  break;

case 'player_rejoined': {
  // Update the opponent's card count using the same pattern as handleCardDrawn
  // (opponents are rendered from gameState, no data-player-id attribute exists in the DOM)
  const opp = gameState.opponents?.find(o => o.id === msg.playerId);
  if (opp) {
    opp.cardCount = msg.cardCount;
    renderOpponents();
  }
  break;
}
```

- [ ] **Step 3: Verify integration by running server and doing a manual smoke test**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun run server.js
```

Open two browser tabs to `http://localhost:3000`. Host a game in one tab, join in another, start the game. Play a card — you should see the move notification appear center-screen in both tabs.

- [ ] **Step 4: Test reconnection manually**

With a game in progress, reload one of the browser tabs. The tab should automatically rejoin the game (no manual input required). You should see the last notification on reconnect and the rejoining player's hand.

- [ ] **Step 5: Run full test suite one final time**

```bash
cd /Users/kevinhuang/Documents/GitHub/uno && bun test
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add public/js/screens/game.js
git commit -m "feat: add move notification renderer and player_rejoined handler"
```

---

## Done

All tasks complete. Both features are live:

- **Reconnection:** Players who reload automatically rejoin with a 4-card penalty. Rooms with all players gone are cleaned up after 5 minutes.
- **Move Notifications:** Every action broadcasts a color-coded center-screen banner to all players. UNO calls get a pulsing red outlined alert. Rejoining players see the most recent notification immediately.
