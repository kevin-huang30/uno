# Design: Reconnection & Move Notifications

**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Two independent, additive features for the UNO multiplayer game:

1. **Reconnection** — Players who reload the page automatically rejoin their active game. They draw 4 cards as a rejoining penalty.
2. **Move Notifications** — Every player sees a center-screen banner announcing the last played move in real time.

Neither feature removes or breaks existing behaviour.

---

## Feature 1: Reconnection

### Problem

When a player reloads the page, the browser opens a fresh WebSocket connection with a new `playerId` (e.g. `player_47`). The server cannot match this to the player's existing game slot, so the player effectively loses their hand and is stuck on the start screen.

### Solution: localStorage Session Token

On join, persist `{ playerId, roomCode, name }` to `localStorage`. On page load, if a session exists, automatically send a `rejoin_game` message instead of showing the start screen. The server looks up the room and player, swaps in the new socket, deals 4 penalty cards, and sends back the full game state.

### Message Protocol (additions to `protocol/messages.js`)

| Direction | Type | Payload | Description |
|---|---|---|---|
| C→S | `rejoin_game` | `{ playerId, roomCode, name }` | Reconnect attempt on page load |
| S→C | `rejoin_success` | Spreads `game.getGameState(playerId)` (same shape as `game_started`) + `lastNotification` | Full game state snapshot for rejoining player |
| S→C | `rejoin_failed` | `{ reason }` | Room gone, game over, or player not found |

### Server Changes

#### `server.js` — new `rejoin_game` handler

**Critical:** Read `playerId` from the message payload (`msg.playerId`), NOT from `ws.data.playerId`. Every other handler uses `ws.data.playerId`, but at the time of rejoin the new socket has a freshly assigned ID that is irrelevant.

```
handler(ws, msg):
  1. Look up room = roomManager.getRoomByCode(msg.roomCode)
  2. If no room, or room.status !== 'playing': send rejoin_failed { reason: 'room_not_found' | 'game_not_active' }
  3. Find player = room.players.find(p => p.id === msg.playerId)
  4. If no player: send rejoin_failed { reason: 'player_not_found' }
  5. Call room.rejoinPlayer(msg.playerId, ws)
     → swaps socket, removes from disconnectedPlayers, sets ws.data fields
  6. Update roomManager.playerRooms: delete old entry (may be stale), add msg.playerId → msg.roomCode
  7. Deal 4 penalty cards: for i in 0..3: game.hands[msg.playerId].push(game.deck.draw())
  8. Broadcast to others: { type: PLAYER_REJOINED, playerId: msg.playerId, name: player.name, penaltyCards: 4 }
  9. Send to rejoining player: rejoin_success = { ...game.getGameState(msg.playerId), lastNotification: room.lastNotification }
     (getGameState() already returns hand, opponents, topCard, chosenColor, currentPlayerId, direction, scores,
      currentRound, totalRounds, status, drawPileCount, pendingWD4Target, drawnCardPlayable — all consumed by game.js)
```

#### `Room.js` — `rejoinPlayer(playerId, ws)` (new method)

```js
rejoinPlayer(playerId, ws) {
  const player = this.players.find(p => p.id === playerId)
  this.sockets.set(playerId, ws)
  this.disconnectedPlayers.delete(playerId)
  // Set ws.data so close() handler works correctly for future disconnects
  ws.data.playerId = playerId
  ws.data.name = player.name
  ws.data.roomCode = this.code
  return player
}
```

**Why `ws.data` must be set here:** The `close()` handler in `server.js` reads `ws.data.name` and `ws.data.roomCode` when broadcasting `PLAYER_LEFT`. Without setting these on the new socket, a subsequent disconnect would broadcast `playerName: null`.

#### 5-minute room cleanup on full disconnect

**Architectural boundary:** `Room` must not call `RoomManager` directly (no existing coupling). The timer is set up and torn down in `server.js`'s `close()` handler, which already has access to both `room` and `roomManager`.

Store the timer reference on the Room instance (`this._emptyRoomTimer = null`) so `server.js` can cancel it on rejoin.

**In `server.js` `close()` handler**, after adding the player to `disconnectedPlayers`:
```
if room.disconnectedPlayers.size === room.players.length:
  room._emptyRoomTimer = setTimeout(() => {
    roomManager.deleteRoom(room.code)
  }, 5 * 60 * 1000)
```

**In `server.js` `rejoin_game` handler**, after calling `room.rejoinPlayer()`:
```
if room._emptyRoomTimer:
  clearTimeout(room._emptyRoomTimer)
  room._emptyRoomTimer = null
```

**Note on `isEmpty` and existing guards:** `Room.isEmpty` is `this.sockets.size === 0`. The existing `close()` handler already guards non-game room deletion with `room.status !== 'playing'` — that path is unaffected. The new timer is additive and only fires for playing rooms where all players have disconnected.

**Note on old socket close events:** When `rejoinPlayer()` swaps in a new socket, the old socket is no longer referenced in `room.sockets` but Bun does not close it immediately — it closes when the underlying TCP connection drops. When its `close` event fires, `ws.data.playerId` is the stale new-connection ID (e.g. `player_47`) which was never in `playerRooms`, so `roomManager.removePlayer('player_47')` returns `null` and is a no-op. This is harmless.

#### `RoomManager.js` — `getRoomByCode(code)` (new method if not already present)

The rejoin handler needs to look up a room by code directly. Add `getRoomByCode(code) { return this.rooms.get(code) }` if it doesn't already exist.

#### `server.js` — auto-reconnect path

The existing `ws.js` auto-reconnect fires on any `close` event, including transient network drops mid-game. After this change, both page reload and transient-drop reconnects will go through the same `rejoin_game` flow (both find a session in `localStorage`). **This is correct and intentional.** No distinction between the two paths is needed.

### Client Changes

#### `ws.js` — on WebSocket open

```js
// Before showing start screen:
const raw = localStorage.getItem('uno_session')
if (raw) {
  const session = JSON.parse(raw)
  ws.send(JSON.stringify({ type: 'rejoin_game', ...session }))
  return  // wait for rejoin_success or rejoin_failed
}
// else: show start screen normally
```

#### `main.js` — session lifecycle

**Save session** (after `room_created` or `room_joined`, using `myPlayerId` which is set by `detectPlayerId()` before the switch statement):
```js
localStorage.setItem('uno_session', JSON.stringify({ playerId: myPlayerId, roomCode, name }))
```

**On `rejoin_success`:** Jump directly to game screen. Render hand, opponents, top card, scores — identical path to `game_started`. Display `lastNotification` if present.

**On `rejoin_failed`:**
```js
showToast('Your game is no longer available')
localStorage.removeItem('uno_session')
showScreen('start')
```

**On intentional leave (`leave_game` sent):**
```js
localStorage.removeItem('uno_session')
```

**On `rejoin_success` when `status !== 'playing'`:** The server should send `rejoin_failed` instead (see server handler step 2). The client never needs to handle this case.

### Rejoining Penalty

When a player rejoins, the server immediately deals them 4 cards. This is reflected in:
- The `rejoin_success` payload (their updated `hand`)
- A broadcast to other players via `PLAYER_REJOINED` so opponents update their card counts
- A move notification: `"Alice rejoined — drew 4 cards"` (type: `action`, cardColor: `null`)

### Edge Cases

| Scenario | Behaviour |
|---|---|
| Server restarted (room gone) | `rejoin_failed` → toast → clear session → start screen |
| Game not in progress (waiting/finished) | `rejoin_failed` → same |
| All players disconnect | 5-minute countdown starts; room deleted if no one rejoins |
| One player rejoins before 5 min | Countdown cancelled; room preserved |
| Two tabs with same session | Second tab sends `rejoin_game`, rejoins successfully. First tab's socket is now stale — next send will fail, `ws.onerror` fires, `_scheduleReconnect` runs, second rejoin attempt arrives, server updates socket again. Net result: last tab to reconnect wins. |
| Host disconnects and rejoins | Existing `host_changed` logic unaffected; host slot preserved |

---

## Feature 2: Move Notifications

### Problem

Players have no at-a-glance indication of what just happened, especially action cards (Skip, Reverse, Draw Two) and Wild cards that affect others.

### Solution: Server-Driven Notification Messages

After processing each game action, the server computes a notification and broadcasts a `move_notification` message to all players in the room. The client renders it as a center-screen banner.

### Message Protocol (addition to `protocol/messages.js`)

| Direction | Type | Payload | Description |
|---|---|---|---|
| S→C | `move_notification` | `{ text, subtext, cardColor, type }` | Broadcast after each action |

**`type` values:** `normal` · `action` · `wild` · `uno`

**`cardColor` values:** `'red'` · `'blue'` · `'green'` · `'yellow'` · `null` (wild and uno events)

### Server Changes — `game/NotificationBuilder.js` (new file)

Stateless helper. Single export:

```js
buildNotification({ eventType, card, playerName, nextPlayerName, affectedPlayerName, chosenColor })
// returns { text, subtext, cardColor, type }
```

Parameters are passed explicitly by the caller in `server.js` after processing each game action — no `game` object or `result` blob passed in. The caller extracts the relevant fields from the action result before calling.

| `eventType` | `text` | `subtext` | `type` | `cardColor` |
|---|---|---|---|---|
| `play_number` | `"Alice played Red 7"` | `"Bob's turn →"` | `normal` | card color |
| `play_skip` | `"Alice played Blue Skip"` | `"Bob's turn is skipped → Charlie's turn"` | `action` | card color |
| `play_reverse` | `"Alice played Green Reverse"` | `"Direction flipped → Bob's turn"` | `action` | card color |
| `play_draw_two` | `"Alice played Yellow Draw 2"` | `"Bob draws 2 and is skipped"` | `action` | card color |
| `play_wild` | `"Alice played Wild"` | `"Chose Blue → Bob's turn"` | `wild` | `null` |
| `play_wd4` | `"Alice played Wild Draw Four"` | `"Chose Red · Bob draws 4 and is skipped"` | `wild` | `null` |
| `draw_card` | `"Alice drew a card"` | `"Alice's turn continues"` | `normal` | `null` |
| `auto_draw` | `"Alice's turn timed out"` | `"Drew a card → Bob's turn"` | `normal` | `null` |
| `call_uno` | `"Alice called UNO!"` | `"1 card remaining"` | `uno` | `null` |
| `player_rejoined` | `"Alice rejoined"` | `"Drew 4 cards"` | `action` | `null` |

Player names truncated to 20 characters with ellipsis.

**Integration in `server.js`:** After broadcasting each game update message, build and broadcast the notification, then store it on the room:
```js
const notification = NotificationBuilder.buildNotification({ eventType, ... })
room.lastNotification = notification
room.broadcast({ type: 'move_notification', ...notification })
```

`room.lastNotification` is included in `rejoin_success` so the rejoining player sees the most recent event.

**`draw_card` vs `auto_draw` distinction:** When the turn timer fires and auto-draws for a disconnected/idle player, use `eventType: 'auto_draw'`. When a player manually draws, use `eventType: 'draw_card'`. The caller in `server.js` knows which path triggered the draw.

### Client Changes — notification renderer (in `game.js`)

**DOM:** One `<div id="notification">` element added to `index.html`, positioned fixed center-screen, initially hidden.

**Queue:** Notifications display one at a time, FIFO. If a notification arrives while one is showing, it waits.

**Renderer branch — use `type` as the primary selector, not `cardColor`:**

```
if type === 'uno':
  → outlined red alert (regardless of cardColor)
else:
  → gradient banner, color from cardColor
```

**`normal` / `action` / `wild`** — Style B gradient banner, color-matched to `cardColor`:
- `'red'`: `#e53e3e → #c53030`
- `'blue'`: `#3182ce → #2b6cb0`
- `'green'`: `#38a169 → #276749`
- `'yellow'`: `#d69e2e → #b7791f`
- `null` (wild/action with no color): `#553c9a → #ee4b6a`
- Shows `text` (large, bold) + `subtext` (small, muted)
- Fades in → holds 2.5s → fades out

**`uno`** — Outlined red alert with flash animation:
- Transparent background, `2px solid #ff4444` border, red text
- CSS `@keyframes` pulse: opacity 1 → 0.4 → 1, repeated 3×, total 1.5s
- Then fades out
- No gradient applied even though `cardColor` is `null`

**No dismiss required** — all notifications auto-dismiss.

### Edge Cases

| Scenario | Behaviour |
|---|---|
| Rapid plays | Queue drains in order — each notification completes before next |
| Player disconnects mid-notification | Other clients unaffected |
| Rejoining player | Receives `lastNotification` in `rejoin_success`, displayed immediately |
| Long player name (>20 chars) | Truncated with ellipsis |
| Auto-draw (turn timer) | `eventType: 'auto_draw'` → "Alice's turn timed out" — distinct from manual draw |

---

## Files Changed

| File | Change |
|---|---|
| `protocol/messages.js` | Add `REJOIN_GAME`, `REJOIN_SUCCESS`, `REJOIN_FAILED`, `MOVE_NOTIFICATION`, `PLAYER_REJOINED` constants |
| `game/Room.js` | Add `rejoinPlayer()` method; add `lastNotification` field; add `_emptyRoomTimer` with 5-min cleanup logic |
| `game/NotificationBuilder.js` | **New** — stateless notification builder, `buildNotification({ eventType, ... })` |
| `lobby/RoomManager.js` | Add `getRoomByCode(code)` if not present; add `deleteRoom(code)` method |
| `server.js` | Handle `rejoin_game` (reading playerId from msg, not ws.data); update `playerRooms` after rejoin; deal 4 penalty cards; call `NotificationBuilder` after each action; include `lastNotification` in `rejoin_success`; pass `auto_draw` eventType from turn timer path |
| `public/index.html` | Add `<div id="notification">` |
| `public/js/ws.js` | Check localStorage on open; send `rejoin_game` if session exists |
| `public/js/main.js` | Handle `rejoin_success`, `rejoin_failed`; save/clear localStorage on join/leave using `myPlayerId` |
| `public/js/screens/game.js` | Notification renderer + FIFO queue; branch on `type` field first |
| `public/css/style.css` | Notification styles + `@keyframes` pulse animation |

---

## What Is Not Changing

- Game logic (`Game.js`, `Deck.js`, `Card.js`) — untouched (penalty cards dealt directly via `game.hands` in server handler)
- Room code generation — untouched
- Turn timer — untouched (auto-draw-and-skip continues to handle disconnected players' turns; the timer path now passes `auto_draw` eventType to NotificationBuilder)
- Round-over screen — untouched
- All existing message types — untouched
