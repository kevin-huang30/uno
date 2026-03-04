import { COLORS, VALUES, WILDS, createCard } from './Card.js';

export function createFullDeck() {
  const cards = [];
  let id = 0;

  for (const color of COLORS) {
    // One 0 per color
    cards.push(createCard(`card_${id++}`, color, '0'));

    // Two of each 1-9 and action cards per color
    for (const value of VALUES) {
      if (value === '0') continue;
      cards.push(createCard(`card_${id++}`, color, value));
      cards.push(createCard(`card_${id++}`, color, value));
    }
  }

  // 4 of each wild type
  for (const wild of WILDS) {
    for (let i = 0; i < 4; i++) {
      cards.push(createCard(`card_${id++}`, null, wild));
    }
  }

  return cards;
}

export function shuffle(cards) {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Deck {
  constructor() {
    this.drawPile = shuffle(createFullDeck());
    this.discardPile = [];
  }

  draw(count = 1) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0) {
        this.reshuffle();
      }
      if (this.drawPile.length === 0) break;
      drawn.push(this.drawPile.pop());
    }
    return drawn;
  }

  discard(card) {
    this.discardPile.push(card);
  }

  reshuffle() {
    if (this.discardPile.length <= 1) return;
    const topCard = this.discardPile.pop();
    this.drawPile = shuffle(this.discardPile);
    this.discardPile = [topCard];
  }

  get drawCount() {
    return this.drawPile.length;
  }

  get discardCount() {
    return this.discardPile.length;
  }
}
