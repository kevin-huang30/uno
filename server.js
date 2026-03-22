import { RoomManager } from './lobby/RoomManager.js';
import { C2S, S2C } from './protocol/messages.js';
import { join } from 'path';
import { buildNotification } from './game/NotificationBuilder.js';

const roomManager = new RoomManager();

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getMime(path) {
  const ext = path.substring(path.lastIndexOf('.'));
  return MIME_TYPES[ext] || 'application/octet-stream';
}

let nextPlayerId = 1;

const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const playerId = `player_${nextPlayerId++}`;
      const success = server.upgrade(req, { data: { playerId } });
      if (success) return undefined;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Static file serving
    let filePath = url.pathname;
    if (filePath === '/') filePath = '/index.html';

    const fullPath = join(import.meta.dir, 'public', filePath);
    const file = Bun.file(fullPath);

    if (await file.exists()) {
      return new Response(file, {
        headers: { 'Content-Type': getMime(filePath) },
      });
    }

    return new Response('Not found', { status: 404 });
  },

  websocket: {
    open(ws) {
      ws.data.name = null;
      ws.data.roomCode = null;
    },

    message(ws, raw) {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        ws.send(JSON.stringify({ type: S2C.ERROR, message: 'Invalid JSON' }));
        return;
      }

      handleMessage(ws, msg);
    },

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
  },
});

function handleMessage(ws, msg) {
  const playerId = ws.data.playerId;

  switch (msg.type) {
    case C2S.HOST_GAME:
      handleHostGame(ws, msg, playerId);
      break;
    case C2S.JOIN_GAME:
      handleJoinGame(ws, msg, playerId);
      break;
    case C2S.LEAVE_GAME:
      handleLeaveGame(ws, playerId);
      break;
    case C2S.START_GAME:
      handleStartGame(ws, msg, playerId);
      break;
    case C2S.PLAY_CARD:
      handlePlayCard(ws, msg, playerId);
      break;
    case C2S.DRAW_CARD:
      handleDrawCard(ws, playerId);
      break;
    case C2S.KEEP_CARD:
      handleKeepCard(ws, playerId);
      break;
    case C2S.CHOOSE_COLOR:
      handleChooseColor(ws, msg, playerId);
      break;
    case C2S.CALL_UNO:
      handleCallUno(ws, playerId);
      break;
    case C2S.CATCH_UNO:
      handleCatchUno(ws, msg, playerId);
      break;
    case C2S.CHALLENGE_WD4:
      handleChallengeWD4(ws, playerId);
      break;
    case C2S.ACCEPT_WD4:
      handleAcceptWD4(ws, playerId);
      break;
    case C2S.NEXT_ROUND:
      handleNextRound(ws, playerId);
      break;
    case C2S.PLAY_AGAIN:
      handlePlayAgain(ws, playerId);
      break;
    case C2S.REJOIN_GAME:
      handleRejoinGame(ws, msg);
      break;
    default:
      sendError(ws, 'Unknown message type');
  }
}

function sendError(ws, message) {
  ws.send(JSON.stringify({ type: S2C.ERROR, message }));
}

function handleHostGame(ws, msg, playerId) {
  const name = msg.name?.trim();
  if (!name) return sendError(ws, 'Name is required');

  ws.data.name = name;
  const room = roomManager.createRoom(playerId, name, ws);

  if (msg.rounds) {
    room.totalRounds = Math.max(1, Math.min(99, parseInt(msg.rounds) || 1));
  }

  ws.data.roomCode = room.code;
  ws.send(JSON.stringify({
    type: S2C.ROOM_CREATED,
    code: room.code,
    players: room.getPlayerList(),
    totalRounds: room.totalRounds,
  }));
}

function handleJoinGame(ws, msg, playerId) {
  const name = msg.name?.trim();
  const code = msg.code?.trim()?.toUpperCase();
  if (!name) return sendError(ws, 'Name is required');
  if (!code) return sendError(ws, 'Room code is required');

  ws.data.name = name;
  const result = roomManager.joinRoom(code, playerId, name, ws);

  if (result.error) return sendError(ws, result.error);

  ws.data.roomCode = code;
  const room = result.room;

  ws.send(JSON.stringify({
    type: S2C.ROOM_JOINED,
    code: room.code,
    players: room.getPlayerList(),
    totalRounds: room.totalRounds,
  }));

  room.broadcast({
    type: S2C.PLAYER_JOINED,
    playerId,
    playerName: name,
    players: room.getPlayerList(),
  }, playerId);
}

function handleLeaveGame(ws, playerId) {
  const result = roomManager.removePlayer(playerId);
  if (result && result.room) {
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
  ws.data.roomCode = null;
}

function handleStartGame(ws, msg, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room) return sendError(ws, 'Not in a room');
  if (room.hostId !== playerId) return sendError(ws, 'Only the host can start the game');

  if (msg.rounds) {
    room.totalRounds = Math.max(1, Math.min(99, parseInt(msg.rounds) || 1));
  }

  const result = room.startGame();
  if (result.error) return sendError(ws, result.error);

  // Send each player their own hand
  for (const player of room.players) {
    room.sendTo(player.id, {
      type: S2C.GAME_STARTED,
      ...room.game.getGameState(player.id),
      startEffects: result.effects,
    });
  }

  startTurnTimer(room);
}

function handlePlayCard(ws, msg, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');

  const result = room.game.playCard(playerId, msg.cardId, msg.callUno || false);
  if (result.error) return sendError(ws, result.error);

  clearTurnTimer(room);

  if (result.winner) {
    // Round/game over
    for (const player of room.players) {
      room.sendTo(player.id, {
        type: result.gameOver ? S2C.GAME_OVER : S2C.ROUND_OVER,
        winner: result.winner,
        winnerName: room.players.find(p => p.id === result.winner)?.name,
        lastCard: result.played,
        roundScore: result.roundScore,
        scores: result.totalScores,
        hands: Object.fromEntries(
          room.players.map(p => [p.id, room.game.getHand(p.id)])
        ),
        players: room.getPlayerList(),
      });
    }
    if (result.gameOver) {
      room.status = 'finished';
    }
    return;
  }

  // Broadcast card played
  room.broadcast({
    type: S2C.CARD_PLAYED,
    playerId,
    card: result.played,
    cardCount: room.game.getHand(playerId).length,
  });

  if (result.needsColor) {
    room.sendTo(playerId, { type: S2C.WAITING_FOR_COLOR });
    return;
  }

  broadcastEffects(room, result.effects);
  broadcastTurnChange(room);
  startTurnTimer(room);
}

function handleDrawCard(ws, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');

  const result = room.game.drawCard(playerId);
  if (result.error) return sendError(ws, result.error);

  clearTurnTimer(room);

  // Tell the player what they drew
  room.sendTo(playerId, {
    type: S2C.DRAW_RESULT,
    card: result.card,
    playable: result.playable,
  });

  // Tell everyone else a card was drawn
  room.broadcast({
    type: S2C.CARD_DRAWN,
    playerId,
    cardCount: room.game.getHand(playerId).length,
  }, playerId);

  if (result.playable) {
    room.sendTo(playerId, { type: S2C.DRAWN_CARD_PLAYABLE, card: result.card });
  } else {
    broadcastTurnChange(room);
    startTurnTimer(room);
  }
}

function handleKeepCard(ws, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');

  const result = room.game.keepCard(playerId);
  if (result.error) return sendError(ws, result.error);

  broadcastTurnChange(room);
  startTurnTimer(room);
}

function handleChooseColor(ws, msg, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');

  const result = room.game.chooseColor(playerId, msg.color);
  if (result.error) return sendError(ws, result.error);

  room.broadcast({
    type: S2C.COLOR_CHOSEN,
    playerId,
    color: result.color,
  });

  if (result.awaitingChallenge) {
    // Target player can challenge or accept
    room.sendTo(result.targetId, {
      type: S2C.DRAW_PENALTY,
      canChallenge: true,
      fromPlayerId: playerId,
    });
  } else {
    broadcastTurnChange(room);
    startTurnTimer(room);
  }
}

function handleCallUno(ws, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');

  const result = room.game.callUno(playerId);
  if (result.error) return sendError(ws, result.error);

  room.broadcast({
    type: S2C.UNO_CALLED,
    playerId,
    playerName: ws.data.name,
  });
}

function handleCatchUno(ws, msg, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');

  const result = room.game.catchUno(playerId, msg.targetId);
  if (result.error) return sendError(ws, result.error);

  room.broadcast({
    type: S2C.UNO_CAUGHT,
    catcherId: playerId,
    catcherName: ws.data.name,
    targetId: result.targetId,
    targetName: room.players.find(p => p.id === result.targetId)?.name,
    penaltyCount: 2,
  });

  // Update target's hand count for everyone
  room.sendTo(result.targetId, {
    type: S2C.DRAW_RESULT,
    cards: result.cards,
    reason: 'uno_penalty',
  });
}

function handleChallengeWD4(ws, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');

  clearTurnTimer(room);

  const result = room.game.challengeWD4(playerId);
  if (result.error) return sendError(ws, result.error);

  room.broadcast({
    type: S2C.CHALLENGE_RESULT,
    challengerId: playerId,
    success: result.challengeSuccess,
    penalty: {
      playerId: result.penalty.playerId,
      count: result.penalty.count,
    },
  });

  // Send penalty cards to the penalized player
  room.sendTo(result.penalty.playerId, {
    type: S2C.DRAW_RESULT,
    cards: result.penalty.cards,
    reason: 'wd4_challenge',
  });

  broadcastTurnChange(room);
  startTurnTimer(room);
}

function handleAcceptWD4(ws, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');

  clearTurnTimer(room);

  const result = room.game.acceptWD4(playerId);
  if (result.error) return sendError(ws, result.error);

  room.broadcast({
    type: S2C.CARD_DRAWN,
    playerId,
    cardCount: room.game.getHand(playerId).length,
    reason: 'wd4_accept',
  });

  room.sendTo(playerId, {
    type: S2C.DRAW_RESULT,
    cards: result.penalty.cards,
    reason: 'wd4_accept',
  });

  broadcastTurnChange(room);
  startTurnTimer(room);
}

function handleNextRound(ws, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room || !room.game) return sendError(ws, 'Not in a game');
  if (room.hostId !== playerId) return sendError(ws, 'Only the host can start the next round');

  const effects = room.game.startNextRound();
  if (effects.error) return sendError(ws, effects.error);

  for (const player of room.players) {
    room.sendTo(player.id, {
      type: S2C.GAME_STARTED,
      ...room.game.getGameState(player.id),
      startEffects: effects,
      isNewRound: true,
    });
  }

  startTurnTimer(room);
}

function handlePlayAgain(ws, playerId) {
  const room = roomManager.getRoomByPlayer(playerId);
  if (!room) return sendError(ws, 'Not in a room');
  if (room.hostId !== playerId) return sendError(ws, 'Only the host can restart');

  room.status = 'waiting';
  room.game = null;
  room.broadcast({
    type: S2C.ROOM_JOINED,
    code: room.code,
    players: room.getPlayerList(),
    totalRounds: room.totalRounds,
    playAgain: true,
  });
}

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

function broadcastEffects(room, effects) {
  if (!effects) return;

  if (effects.skippedPlayer) {
    room.broadcast({
      type: S2C.PLAYER_SKIP,
      playerId: effects.skippedPlayer,
    });
  }

  if (effects.drewCards) {
    room.sendTo(effects.drewCards.playerId, {
      type: S2C.DRAW_RESULT,
      cards: effects.drewCards.cards,
      reason: 'draw_two',
    });
    room.broadcast({
      type: S2C.CARD_DRAWN,
      playerId: effects.drewCards.playerId,
      cardCount: room.game.getHand(effects.drewCards.playerId).length,
    }, effects.drewCards.playerId);
  }

  if (effects.reversed) {
    room.broadcast({
      type: S2C.DIRECTION_CHANGED,
      direction: room.game.direction,
    });
  }
}

function broadcastTurnChange(room) {
  const currentPlayer = room.game.getCurrentPlayer();
  room.broadcast({
    type: S2C.TURN_CHANGED,
    currentPlayerId: currentPlayer.id,
    currentPlayerName: currentPlayer.name,
  });
}

function startTurnTimer(room) {
  clearTurnTimer(room);
  room.turnTimer = setTimeout(() => {
    if (!room.game || room.game.status !== 'playing') return;
    const currentPlayer = room.game.getCurrentPlayer();

    // Auto-draw for the player
    const result = room.game.drawCard(currentPlayer.id);
    if (result.error) return;

    room.sendTo(currentPlayer.id, {
      type: S2C.DRAW_RESULT,
      card: result.card,
      playable: result.playable,
      autoDrawn: true,
    });

    room.broadcast({
      type: S2C.CARD_DRAWN,
      playerId: currentPlayer.id,
      cardCount: room.game.getHand(currentPlayer.id).length,
      autoDrawn: true,
    }, currentPlayer.id);

    if (result.playable) {
      // Auto-keep
      room.game.keepCard(currentPlayer.id);
    }

    broadcastTurnChange(room);
    startTurnTimer(room);
  }, room.turnTimeLimit);
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

console.log(`UNO server running on http://localhost:${server.port}`);

export { server, roomManager };
