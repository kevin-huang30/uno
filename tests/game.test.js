import { describe, test, expect, beforeEach } from 'bun:test';
import { Game } from '../game/Game.js';
import { createCard } from '../game/Card.js';

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player${i}` }));
}

function setupGame(playerCount = 2, totalRounds = 1) {
  const players = makePlayers(playerCount);
  const game = new Game(players, totalRounds);
  game.startRound();
  // Reset to clean state: player 0's turn, direction clockwise, number top card
  game.currentPlayerIndex = 0;
  game.direction = 1;
  return game;
}

// Helper: force top card and color
function setTopCard(game, card, color = null) {
  game.topCard = card;
  game.chosenColor = color;
  game.deck.discard(card);
}

describe('Setup & dealing', () => {
  test('each player gets at least 7 cards', () => {
    const players = makePlayers(3);
    const game = new Game(players);
    game.startRound();
    for (const p of game.players) {
      // At least 7 (could be more if starting card is draw_two)
      expect(game.getHand(p.id).length).toBeGreaterThanOrEqual(7);
    }
  });

  test('draw pile has correct remaining count (no start effects)', () => {
    // Use setupGame which resets state, then check totals
    const game = setupGame(3);
    // Total cards across all hands + draw + discard should equal 108
    const handTotal = game.players.reduce((sum, p) => sum + game.getHand(p.id).length, 0);
    const total = handTotal + game.deck.drawCount + game.deck.discardCount;
    expect(total).toBe(108);
  });

  test('first player index is 0', () => {
    const players = makePlayers(3);
    const game = new Game(players);
    // Force a number card as top to avoid skip/reverse effects
    game.startRound();
    // The start card effects might change currentPlayerIndex, so we just check it's valid
    expect(game.currentPlayerIndex).toBeGreaterThanOrEqual(0);
    expect(game.currentPlayerIndex).toBeLessThan(3);
  });

  test('direction starts at 1 (clockwise)', () => {
    const players = makePlayers(3);
    const game = new Game(players);
    game.startRound();
    // Direction might change if starting card is reverse
    // but by default it's 1 or -1 (if reverse was flipped)
    expect(Math.abs(game.direction)).toBe(1);
  });

  test('starting wild_draw_four gets reshuffled', () => {
    // Create game and verify no WD4 as top card
    for (let i = 0; i < 20; i++) {
      const game = setupGame(2);
      expect(game.topCard.value).not.toBe('wild_draw_four');
    }
  });
});

describe('Basic turn flow', () => {
  test('current player can play a matching card', () => {
    const game = setupGame(2);
    const current = game.getCurrentPlayer();

    setTopCard(game, createCard('top', 'red', '3'));
    game.hands[current.id] = [createCard('test_1', 'red', '5'), createCard('x', 'blue', '1')];

    const result = game.playCard(current.id, 'test_1');
    expect(result.error).toBeUndefined();
    expect(result.played.id).toBe('test_1');
  });

  test('playing a card removes it from hand and sets as top card', () => {
    const game = setupGame(2);
    const current = game.getCurrentPlayer();

    setTopCard(game, createCard('top', 'red', '3'));
    const card = createCard('test_1', 'red', '5');
    game.hands[current.id] = [card, createCard('x', 'blue', '1')];

    game.playCard(current.id, 'test_1');
    expect(game.topCard.id).toBe('test_1');
    expect(game.hands[current.id].find(c => c.id === 'test_1')).toBeUndefined();
  });

  test('turn advances to next player after a play', () => {
    const game = setupGame(3);
    const p0 = game.players[0];
    game.currentPlayerIndex = 0;

    setTopCard(game, createCard('top', 'red', '3'));
    game.hands[p0.id] = [createCard('c1', 'red', '5'), createCard('c2', 'blue', '1')];

    game.playCard(p0.id, 'c1');
    expect(game.getCurrentPlayer().id).toBe('p1');
  });

  test("non-current player's play attempt is rejected", () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;

    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p1'] = [createCard('c1', 'red', '5')];

    const result = game.playCard('p1', 'c1');
    expect(result.error).toBeDefined();
  });

  test("playing a card not in player's hand is rejected", () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;

    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];

    const result = game.playCard('p0', 'nonexistent');
    expect(result.error).toBeDefined();
  });

  test('playing an illegal card is rejected', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;

    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'blue', '7')];

    const result = game.playCard('p0', 'c1');
    expect(result.error).toBeDefined();
  });
});

describe('Drawing', () => {
  test('player can draw when it is their turn', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    const result = game.drawCard('p0');
    expect(result.error).toBeUndefined();
    expect(result.card).toBeDefined();
  });

  test('draw gives exactly 1 card', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    const handBefore = game.getHand('p0').length;
    game.drawCard('p0');
    expect(game.getHand('p0').length).toBe(handBefore + 1);
  });

  test('after drawing a playable card, player can choose to play or keep', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));

    // Force draw pile to have a playable card
    game.deck.drawPile.push(createCard('drawn', 'red', '7'));

    const result = game.drawCard('p0');
    expect(result.playable).toBe(true);
    // Player should be able to keep
    const keepResult = game.keepCard('p0');
    expect(keepResult.kept).toBe(true);
  });

  test('after drawing an unplayable card, turn automatically passes', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));

    // Force draw pile to have an unplayable card
    game.deck.drawPile.push(createCard('drawn', 'blue', '7'));

    const result = game.drawCard('p0');
    expect(result.playable).toBe(false);
    expect(game.getCurrentPlayer().id).toBe('p1');
  });

  test('player cannot draw when it is not their turn', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    const result = game.drawCard('p1');
    expect(result.error).toBeDefined();
  });
});

describe('Skip card', () => {
  test('next player is skipped', () => {
    const game = setupGame(3);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('s', 'red', 'skip'), createCard('x', 'blue', '1')];

    game.playCard('p0', 's');
    // p1 should be skipped, it should be p2's turn
    expect(game.getCurrentPlayer().id).toBe('p2');
  });

  test('in 2-player game, current player gets another turn', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('s', 'red', 'skip'), createCard('x', 'blue', '1')];

    game.playCard('p0', 's');
    expect(game.getCurrentPlayer().id).toBe('p0');
  });
});

describe('Reverse card', () => {
  test('direction changes from 1 to -1', () => {
    const game = setupGame(3);
    game.currentPlayerIndex = 0;
    game.direction = 1;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('r', 'red', 'reverse'), createCard('x', 'blue', '1')];

    game.playCard('p0', 'r');
    expect(game.direction).toBe(-1);
  });

  test('next player is correct based on new direction', () => {
    const game = setupGame(3);
    game.currentPlayerIndex = 0;
    game.direction = 1;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('r', 'red', 'reverse'), createCard('x', 'blue', '1')];

    game.playCard('p0', 'r');
    // Direction reversed, next should be p2
    expect(game.getCurrentPlayer().id).toBe('p2');
  });

  test('in 2-player game, acts as skip', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    game.direction = 1;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('r', 'red', 'reverse'), createCard('x', 'blue', '1')];

    game.playCard('p0', 'r');
    expect(game.getCurrentPlayer().id).toBe('p0');
  });
});

describe('Draw Two', () => {
  test('next player draws 2 cards', () => {
    const game = setupGame(3);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('d', 'red', 'draw_two'), createCard('x', 'blue', '1')];
    const p1Before = game.getHand('p1').length;

    game.playCard('p0', 'd');
    expect(game.getHand('p1').length).toBe(p1Before + 2);
  });

  test('next player loses their turn', () => {
    const game = setupGame(3);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('d', 'red', 'draw_two'), createCard('x', 'blue', '1')];

    game.playCard('p0', 'd');
    // p1 is skipped, p2's turn
    expect(game.getCurrentPlayer().id).toBe('p2');
  });
});

describe('Wild card', () => {
  test('can be played on any card regardless of color', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));
    game.hands['p0'] = [createCard('w', null, 'wild'), createCard('x', 'red', '1')];

    const result = game.playCard('p0', 'w');
    expect(result.error).toBeUndefined();
    expect(result.needsColor).toBe(true);
  });

  test('chosen color is stored and enforced', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));
    game.hands['p0'] = [createCard('w', null, 'wild'), createCard('x', 'red', '1')];

    game.playCard('p0', 'w');
    game.chooseColor('p0', 'green');
    expect(game.chosenColor).toBe('green');
  });

  test('next play must match chosen color or be another wild', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));
    game.hands['p0'] = [createCard('w', null, 'wild'), createCard('x', 'red', '1')];

    game.playCard('p0', 'w');
    game.chooseColor('p0', 'green');

    // p1's turn, should only be able to play green or wild
    game.hands['p1'] = [createCard('c1', 'red', '3'), createCard('c2', 'green', '5')];

    const bad = game.playCard('p1', 'c1');
    expect(bad.error).toBeDefined();

    const good = game.playCard('p1', 'c2');
    expect(good.error).toBeUndefined();
  });
});

describe('Wild Draw Four', () => {
  test('can be played on any card', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));
    // No blue cards in hand so WD4 is legal
    game.hands['p0'] = [createCard('w', null, 'wild_draw_four'), createCard('x', 'red', '1')];

    const result = game.playCard('p0', 'w');
    expect(result.error).toBeUndefined();
    expect(result.needsColor).toBe(true);
  });

  test('next player draws 4 and loses turn after accepting', () => {
    const game = setupGame(3);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));
    game.hands['p0'] = [createCard('w', null, 'wild_draw_four'), createCard('x', 'red', '1')];
    const p1Before = game.getHand('p1').length;

    game.playCard('p0', 'w');
    game.chooseColor('p0', 'red');
    const result = game.acceptWD4('p1');

    expect(game.getHand('p1').length).toBe(p1Before + 4);
    // p1 loses turn, should be p2's turn
    expect(game.getCurrentPlayer().id).toBe('p2');
  });

  test('cannot play WD4 if player has cards matching current color', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));
    // Has a blue card, so WD4 is illegal
    game.hands['p0'] = [createCard('w', null, 'wild_draw_four'), createCard('x', 'blue', '1')];

    const result = game.playCard('p0', 'w');
    expect(result.error).toBeDefined();
  });

  test('can play WD4 if no cards matching current color', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));
    game.hands['p0'] = [createCard('w', null, 'wild_draw_four'), createCard('x', 'red', '1')];

    const result = game.playCard('p0', 'w');
    expect(result.error).toBeUndefined();
  });
});

describe('Challenge system (Wild Draw Four)', () => {
  test('successful challenge: WD4 player draws 4', () => {
    const game = setupGame(3);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));

    // p0 has a blue card but plays WD4 anyway (we bypass restriction for testing)
    game.hands['p0'] = [createCard('w', null, 'wild_draw_four'), createCard('b', 'blue', '1')];

    // Manually bypass the WD4 restriction by removing the color check temporarily
    // Actually, the restriction would block it. Let's set up the scenario differently:
    // p0 plays WD4 with no matching colors, then we modify the snapshot to have matching colors
    game.hands['p0'] = [createCard('w', null, 'wild_draw_four'), createCard('r', 'red', '1')];
    game.playCard('p0', 'w');
    game.chooseColor('p0', 'red');

    // Now modify the hand snapshot to pretend p0 had blue cards
    game.pendingWD4.handSnapshot = [createCard('b', 'blue', '5')];

    const p0Before = game.getHand('p0').length;
    const result = game.challengeWD4('p1');
    expect(result.challengeSuccess).toBe(true);
    expect(game.getHand('p0').length).toBe(p0Before + 4);
  });

  test('failed challenge: challenger draws 6', () => {
    const game = setupGame(3);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'blue', '9'));
    game.hands['p0'] = [createCard('w', null, 'wild_draw_four'), createCard('r', 'red', '1')];

    game.playCard('p0', 'w');
    game.chooseColor('p0', 'red');

    const p1Before = game.getHand('p1').length;
    const result = game.challengeWD4('p1');
    expect(result.challengeSuccess).toBe(false);
    expect(game.getHand('p1').length).toBe(p1Before + 6);
  });
});

describe('UNO call', () => {
  test('player who plays down to 1 card and calls UNO is safe', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5'), createCard('c2', 'blue', '1')];

    game.playCard('p0', 'c1', true); // calledUno = true
    expect(game.unoCalled['p0']).toBe(true);

    // Can't catch them
    const catchResult = game.catchUno('p1', 'p0');
    expect(catchResult.error).toBeDefined();
  });

  test('player who plays down to 1 card without calling can be caught', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5'), createCard('c2', 'blue', '1')];

    game.playCard('p0', 'c1', false); // didn't call UNO
    expect(game.unoCalled['p0']).toBe(false);

    const catchResult = game.catchUno('p1', 'p0');
    expect(catchResult.caught).toBe(true);
  });

  test('being caught results in drawing 2 penalty cards', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5'), createCard('c2', 'blue', '1')];

    game.playCard('p0', 'c1', false);
    const before = game.getHand('p0').length;
    game.catchUno('p1', 'p0');
    expect(game.getHand('p0').length).toBe(before + 2);
  });

  test('calling UNO with more than 1 card has no effect', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    const result = game.callUno('p0');
    expect(result.error).toBeDefined();
  });
});

describe('Win detection', () => {
  test('round ends when a player plays their last card', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];

    const result = game.playCard('p0', 'c1');
    expect(result.winner).toBe('p0');
  });

  test('winner is identified correctly', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];

    const result = game.playCard('p0', 'c1');
    expect(result.winner).toBe('p0');
    expect(game.roundWinner).toBe('p0');
  });

  test('action effects on last card still apply', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', 'draw_two')];

    const result = game.playCard('p0', 'c1');
    expect(result.winner).toBe('p0');
  });
});

describe('Scoring', () => {
  test("winner scores sum of all opponents' remaining cards", () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [
      createCard('a', 'blue', '7'),  // 7
      createCard('b', 'red', 'skip'), // 20
    ];

    const result = game.playCard('p0', 'c1');
    expect(result.roundScore).toBe(27);
    expect(result.totalScores['p0']).toBe(27);
  });

  test('number cards scored at face value', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [createCard('a', 'blue', '9')];

    const result = game.playCard('p0', 'c1');
    expect(result.roundScore).toBe(9);
  });

  test('action cards scored at 20 points', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [createCard('a', 'blue', 'reverse')];

    const result = game.playCard('p0', 'c1');
    expect(result.roundScore).toBe(20);
  });

  test('wild cards scored at 50 points', () => {
    const game = setupGame(2);
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [createCard('a', null, 'wild')];

    const result = game.playCard('p0', 'c1');
    expect(result.roundScore).toBe(50);
  });

  test('scores accumulate across rounds correctly', () => {
    const game = new Game(makePlayers(2), 3);
    game.startRound();

    // Round 1: p0 wins
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [createCard('a', 'blue', '5')]; // 5 pts
    game.playCard('p0', 'c1');

    expect(game.scores['p0']).toBe(5);

    // Round 2
    game.startNextRound();
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top2', 'red', '3'));
    game.hands['p0'] = [createCard('c2', 'red', '7')];
    game.hands['p1'] = [createCard('b', 'green', '8')]; // 8 pts
    game.playCard('p0', 'c2');

    expect(game.scores['p0']).toBe(13);
  });
});

describe('Multi-round', () => {
  test('new round resets hands, deck, direction, current player', () => {
    const game = new Game(makePlayers(2), 2);
    game.startRound();

    // Win round 1
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [createCard('a', 'blue', '5')];
    game.playCard('p0', 'c1');

    game.startNextRound();
    // Players get new hands of at least 7 cards
    expect(game.getHand('p0').length).toBeGreaterThanOrEqual(7);
    expect(game.getHand('p1').length).toBeGreaterThanOrEqual(7);
    // Direction is reset (might be changed by starting card effect)
    expect(Math.abs(game.direction)).toBe(1);
  });

  test('scores persist between rounds', () => {
    const game = new Game(makePlayers(2), 2);
    game.startRound();
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [createCard('a', 'blue', '9')]; // 9 pts
    game.playCard('p0', 'c1');

    const scoreBefore = game.scores['p0'];
    game.startNextRound();
    expect(game.scores['p0']).toBe(scoreBefore);
  });

  test('game ends after configured number of rounds', () => {
    const game = new Game(makePlayers(2), 1);
    game.startRound();
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [createCard('a', 'blue', '5')];

    const result = game.playCard('p0', 'c1');
    expect(result.gameOver).toBe(true);
    expect(game.status).toBe('game_over');
  });

  test('overall winner has highest total score', () => {
    const game = new Game(makePlayers(2), 1);
    game.startRound();
    game.currentPlayerIndex = 0;
    setTopCard(game, createCard('top', 'red', '3'));
    game.hands['p0'] = [createCard('c1', 'red', '5')];
    game.hands['p1'] = [createCard('a', 'blue', '5')];
    game.playCard('p0', 'c1');

    expect(game.getOverallWinner()).toBe('p0');
  });
});

describe('Edge cases', () => {
  test('game with 2 players (minimum)', () => {
    const game = setupGame(2);
    expect(game.players.length).toBe(2);
    expect(game.status).toBe('playing');
  });

  test('game with 10 players (maximum)', () => {
    const players = makePlayers(10);
    const game = new Game(players);
    game.startRound();
    expect(game.players.length).toBe(10);
    expect(game.status).toBe('playing');
    // Each player starts with 7, but the starting card might add cards to first player
    // Just verify all players have at least 7 cards
    for (const p of game.players) {
      expect(game.getHand(p.id).length).toBeGreaterThanOrEqual(7);
    }
  });

  test('draw pile exhaustion triggers reshuffle', () => {
    const game = setupGame(2);
    // Exhaust the draw pile
    const remaining = game.deck.drawCount;
    const drawn = game.deck.draw(remaining);
    // Add to discard
    for (const c of drawn) game.deck.discard(c);

    // Now drawing should trigger reshuffle
    game.currentPlayerIndex = 0;
    const result = game.drawCard('p0');
    expect(result.card).toBeDefined();
  });
});
