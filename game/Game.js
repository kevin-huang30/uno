import { canPlayOn, scoreValue, ACTION_VALUES } from './Card.js';
import { Deck } from './Deck.js';

export class Game {
  constructor(players, totalRounds = 1) {
    this.players = players; // [{id, name}]
    this.totalRounds = totalRounds;
    this.currentRound = 0;
    this.scores = {};
    for (const p of players) {
      this.scores[p.id] = 0;
    }
    this.hands = {};
    this.deck = null;
    this.topCard = null;
    this.chosenColor = null;
    this.currentPlayerIndex = 0;
    this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
    this.status = 'waiting'; // waiting, playing, round_over, game_over
    this.unoCalled = {}; // playerId -> true if they called UNO
    this.lastPlayedBy = null;
    this.drawnCard = null; // card drawn this turn (for play-or-keep)
    this.drawnPlayerId = null;
    this.pendingWD4 = null; // {playerId, card, hand snapshot} for challenge
    this.roundWinner = null;
    this.turnTimer = null;
    this.turnTimeLimit = 30000; // 30 seconds
    this.onTurnTimeout = null;
  }

  startRound() {
    this.currentRound++;
    this.deck = new Deck();
    this.hands = {};
    this.unoCalled = {};
    this.drawnCard = null;
    this.drawnPlayerId = null;
    this.pendingWD4 = null;
    this.roundWinner = null;
    this.direction = 1;
    this.currentPlayerIndex = 0;
    this.chosenColor = null;
    this.status = 'playing';

    // Deal 7 cards to each player
    for (const p of this.players) {
      this.hands[p.id] = this.deck.draw(7);
    }

    // Flip starting card
    let startCard = this.deck.draw(1)[0];

    // If starting card is wild_draw_four, reshuffle it back and draw again
    while (startCard.value === 'wild_draw_four') {
      this.deck.drawPile.unshift(startCard);
      this.deck.drawPile = [...this.deck.drawPile]; // keep reference stable
      startCard = this.deck.draw(1)[0];
    }

    this.topCard = startCard;
    this.deck.discard(startCard);

    // Handle starting card effects
    const effects = { skipped: false, drawn: 0, reversed: false };

    if (startCard.value === 'wild') {
      // Random color for wild start
      const colors = ['red', 'green', 'blue', 'yellow'];
      this.chosenColor = colors[Math.floor(Math.random() * 4)];
    } else if (startCard.value === 'skip') {
      effects.skipped = true;
      this.currentPlayerIndex = this._nextPlayerIndex();
    } else if (startCard.value === 'reverse') {
      this.direction = -1;
      effects.reversed = true;
      if (this.players.length === 2) {
        // In 2-player, reverse acts as skip
        this.currentPlayerIndex = this._nextPlayerIndex();
        effects.skipped = true;
      }
    } else if (startCard.value === 'draw_two') {
      const firstPlayer = this.players[0];
      const drawn = this.deck.draw(2);
      this.hands[firstPlayer.id].push(...drawn);
      effects.drawn = 2;
      effects.skipped = true;
      this.currentPlayerIndex = this._nextPlayerIndex();
    }

    return effects;
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getHand(playerId) {
    return this.hands[playerId] || [];
  }

  playCard(playerId, cardId, calledUno = false) {
    if (this.status !== 'playing') {
      return { error: 'Game is not in progress' };
    }

    // If there's a pending WD4 challenge, player must challenge or accept first
    if (this.pendingWD4 && this.pendingWD4.targetId === playerId) {
      return { error: 'You must challenge or accept the Wild Draw Four' };
    }

    const current = this.getCurrentPlayer();
    if (current.id !== playerId) {
      return { error: 'Not your turn' };
    }

    // If player drew a card, they can only play that card
    if (this.drawnPlayerId === playerId && this.drawnCard) {
      if (cardId !== this.drawnCard.id) {
        return { error: 'You can only play the card you just drew' };
      }
    }

    const hand = this.hands[playerId];
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { error: 'Card not in your hand' };
    }

    const card = hand[cardIndex];

    // WD4 restriction: can only play if no cards match current color
    if (card.value === 'wild_draw_four') {
      const currentColor = this.chosenColor || this.topCard.color;
      const hasMatchingColor = hand.some(c => c.id !== card.id && c.color === currentColor);
      if (hasMatchingColor) {
        return { error: 'Cannot play Wild Draw Four when you have cards matching the current color' };
      }
    }

    if (!canPlayOn(card, this.topCard, this.chosenColor)) {
      return { error: 'Card cannot be played on the current card' };
    }

    // Capture active color before modifying state (needed for WD4 challenge)
    const prevActiveColor = this.chosenColor || this.topCard.color;

    // Play the card
    hand.splice(cardIndex, 1);
    this.topCard = card;
    this.deck.discard(card);
    this.chosenColor = null;
    this.drawnCard = null;
    this.drawnPlayerId = null;
    this.lastPlayedBy = playerId;

    // Handle UNO call
    if (hand.length === 1) {
      if (calledUno) {
        this.unoCalled[playerId] = true;
      } else {
        this.unoCalled[playerId] = false;
      }
    } else {
      delete this.unoCalled[playerId];
    }

    // Check for win
    if (hand.length === 0) {
      return this._handleRoundWin(playerId, card);
    }

    // Handle action card effects
    const result = { played: card, effects: {} };

    if (card.value === 'wild' || card.value === 'wild_draw_four') {
      result.needsColor = true;

      if (card.value === 'wild_draw_four') {
        // Store for challenge - snapshot the hand at time of play
        this.pendingWD4 = {
          playerId,
          card,
          handSnapshot: [...hand], // hand after playing
          activeColor: prevActiveColor, // color before WD4
          targetId: this.players[this._nextPlayerIndex()].id,
        };
        // Don't advance turn yet - wait for color choice, then challenge/accept
        return result;
      }
      // Regular wild - wait for color choice
      return result;
    }

    if (card.value === 'skip') {
      this._advanceTurn();
      result.effects.skippedPlayer = this.getCurrentPlayer().id;
      this._advanceTurn();
    } else if (card.value === 'reverse') {
      this.direction *= -1;
      result.effects.reversed = true;
      if (this.players.length === 2) {
        // In 2-player, acts as skip
        this._advanceTurn();
        result.effects.skippedPlayer = this.getCurrentPlayer().id;
        this._advanceTurn();
      } else {
        this._advanceTurn();
      }
    } else if (card.value === 'draw_two') {
      this._advanceTurn();
      const nextPlayer = this.getCurrentPlayer();
      const drawn = this.deck.draw(2);
      this.hands[nextPlayer.id].push(...drawn);
      result.effects.drewCards = { playerId: nextPlayer.id, count: 2, cards: drawn };
      result.effects.skippedPlayer = nextPlayer.id;
      this._advanceTurn();
    } else {
      // Normal number card
      this._advanceTurn();
    }

    return result;
  }

  chooseColor(playerId, color) {
    if (!['red', 'green', 'blue', 'yellow'].includes(color)) {
      return { error: 'Invalid color' };
    }

    this.chosenColor = color;

    if (this.pendingWD4 && this.pendingWD4.playerId === playerId) {
      // WD4 - color chosen, now target can challenge or accept
      return { color, awaitingChallenge: true, targetId: this.pendingWD4.targetId };
    }

    // Regular wild - advance turn
    this._advanceTurn();
    return { color };
  }

  challengeWD4(challengerId) {
    if (!this.pendingWD4) {
      return { error: 'No Wild Draw Four to challenge' };
    }
    if (this.pendingWD4.targetId !== challengerId) {
      return { error: 'Only the target player can challenge' };
    }

    const wd4Player = this.pendingWD4.playerId;
    const activeColor = this.pendingWD4.activeColor;

    // Check if WD4 player had matching color cards at time of play
    const hadMatchingColor = this.pendingWD4.handSnapshot.some(c => c.color === activeColor);

    const result = { challengeSuccess: hadMatchingColor };

    if (hadMatchingColor) {
      // Challenge successful - WD4 player draws 4
      const drawn = this.deck.draw(4);
      this.hands[wd4Player].push(...drawn);
      result.penalty = { playerId: wd4Player, count: 4, cards: drawn };
      // Challenger's turn continues (advance past WD4 player)
      this._advanceTurn();
    } else {
      // Challenge failed - challenger draws 6 (4 + 2 penalty)
      const drawn = this.deck.draw(6);
      this.hands[challengerId].push(...drawn);
      result.penalty = { playerId: challengerId, count: 6, cards: drawn };
      // Challenger loses turn
      this._advanceTurn();
      result.skippedPlayer = challengerId;
      this._advanceTurn();
    }

    this.pendingWD4 = null;
    return result;
  }

  acceptWD4(playerId) {
    if (!this.pendingWD4) {
      return { error: 'No Wild Draw Four to accept' };
    }
    if (this.pendingWD4.targetId !== playerId) {
      return { error: 'Only the target player can accept' };
    }

    const drawn = this.deck.draw(4);
    this.hands[playerId].push(...drawn);
    const result = {
      penalty: { playerId, count: 4, cards: drawn },
      skippedPlayer: playerId,
    };

    this.pendingWD4 = null;
    // Skip target's turn
    this._advanceTurn();
    this._advanceTurn();

    return result;
  }

  drawCard(playerId) {
    if (this.status !== 'playing') {
      return { error: 'Game is not in progress' };
    }

    const current = this.getCurrentPlayer();
    if (current.id !== playerId) {
      return { error: 'Not your turn' };
    }

    if (this.drawnCard) {
      return { error: 'You already drew a card this turn' };
    }

    const cards = this.deck.draw(1);
    if (cards.length === 0) {
      return { error: 'No cards left to draw' };
    }

    const card = cards[0];
    this.hands[playerId].push(card);

    // Check if drawn card is playable
    const playable = canPlayOn(card, this.topCard, this.chosenColor);

    if (playable) {
      this.drawnCard = card;
      this.drawnPlayerId = playerId;
      return { card, playable: true };
    }

    // Not playable - turn passes
    this.drawnCard = null;
    this.drawnPlayerId = null;
    this._advanceTurn();
    return { card, playable: false };
  }

  keepCard(playerId) {
    if (this.drawnPlayerId !== playerId) {
      return { error: 'You have not drawn a card' };
    }

    this.drawnCard = null;
    this.drawnPlayerId = null;
    this._advanceTurn();
    return { kept: true };
  }

  callUno(playerId) {
    const hand = this.hands[playerId];
    if (!hand || hand.length !== 1) {
      return { error: 'Can only call UNO with exactly 1 card' };
    }
    this.unoCalled[playerId] = true;
    return { called: true };
  }

  catchUno(catcherId, targetId) {
    if (catcherId === targetId) {
      return { error: 'Cannot catch yourself' };
    }

    const targetHand = this.hands[targetId];
    if (!targetHand || targetHand.length !== 1) {
      return { error: 'Target does not have exactly 1 card' };
    }

    if (this.unoCalled[targetId] === true) {
      return { error: 'Player already called UNO' };
    }

    if (this.unoCalled[targetId] !== false) {
      return { error: 'Player is not catchable' };
    }

    // Penalty: draw 2 cards
    const drawn = this.deck.draw(2);
    this.hands[targetId].push(...drawn);
    delete this.unoCalled[targetId];

    return { caught: true, targetId, cards: drawn };
  }

  startNextRound() {
    if (this.currentRound >= this.totalRounds) {
      return { error: 'All rounds have been played' };
    }
    return this.startRound();
  }

  getScores() {
    return { ...this.scores };
  }

  getOverallWinner() {
    let maxScore = -1;
    let winner = null;
    for (const [id, score] of Object.entries(this.scores)) {
      if (score > maxScore) {
        maxScore = score;
        winner = id;
      }
    }
    return winner;
  }

  getGameState(forPlayerId) {
    const opponents = this.players
      .filter(p => p.id !== forPlayerId)
      .map(p => ({
        id: p.id,
        name: p.name,
        cardCount: (this.hands[p.id] || []).length,
      }));

    return {
      hand: this.hands[forPlayerId] || [],
      opponents,
      topCard: this.topCard,
      chosenColor: this.chosenColor,
      currentPlayerId: this.getCurrentPlayer().id,
      direction: this.direction,
      drawPileCount: this.deck?.drawCount || 0,
      scores: this.scores,
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      status: this.status,
      pendingWD4Target: this.pendingWD4?.targetId || null,
      drawnCardPlayable: this.drawnPlayerId === forPlayerId ? this.drawnCard : null,
    };
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return null;

    delete this.hands[playerId];
    delete this.scores[playerId];
    delete this.unoCalled[playerId];

    // If it was this player's turn, advance
    const wasCurrent = this.currentPlayerIndex === idx;

    this.players.splice(idx, 1);

    if (this.players.length < 2) {
      this.status = 'game_over';
      return { gameOver: true, reason: 'not_enough_players' };
    }

    // Fix currentPlayerIndex
    if (wasCurrent) {
      this.currentPlayerIndex = this.currentPlayerIndex % this.players.length;
    } else if (idx < this.currentPlayerIndex) {
      this.currentPlayerIndex--;
    }

    return { removed: true };
  }

  // Private methods

  _advanceTurn() {
    this.currentPlayerIndex = this._nextPlayerIndex();
  }

  _nextPlayerIndex() {
    const len = this.players.length;
    return ((this.currentPlayerIndex + this.direction) % len + len) % len;
  }

  _handleRoundWin(winnerId, lastCard) {
    this.roundWinner = winnerId;

    // Calculate score from all other players' hands
    let roundScore = 0;
    for (const p of this.players) {
      if (p.id === winnerId) continue;
      for (const card of this.hands[p.id]) {
        roundScore += scoreValue(card);
      }
    }
    this.scores[winnerId] += roundScore;

    if (this.currentRound >= this.totalRounds) {
      this.status = 'game_over';
    } else {
      this.status = 'round_over';
    }

    // Apply last card effects even though round is over
    const effects = {};
    if (lastCard.value === 'draw_two') {
      const nextIdx = this._nextPlayerIndex();
      const nextPlayer = this.players[nextIdx];
      effects.lastCardEffect = { type: 'draw_two', targetId: nextPlayer.id };
    }

    return {
      played: lastCard,
      winner: winnerId,
      roundScore,
      totalScores: { ...this.scores },
      gameOver: this.status === 'game_over',
      effects,
    };
  }

}
