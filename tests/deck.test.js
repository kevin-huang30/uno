import { describe, test, expect } from 'bun:test';
import { createFullDeck, shuffle, Deck } from '../game/Deck.js';

describe('createFullDeck', () => {
  const deck = createFullDeck();

  test('produces exactly 108 cards', () => {
    expect(deck.length).toBe(108);
  });

  test('contains exactly 76 number cards', () => {
    const numberCards = deck.filter(c => c.color && !isNaN(parseInt(c.value)));
    expect(numberCards.length).toBe(76);
  });

  test('contains 1 zero per color (4 total)', () => {
    const zeros = deck.filter(c => c.value === '0');
    expect(zeros.length).toBe(4);
    const colors = new Set(zeros.map(c => c.color));
    expect(colors.size).toBe(4);
  });

  test('contains 2 of each 1-9 per color (72 total)', () => {
    for (const color of ['red', 'green', 'blue', 'yellow']) {
      for (let n = 1; n <= 9; n++) {
        const cards = deck.filter(c => c.color === color && c.value === String(n));
        expect(cards.length).toBe(2);
      }
    }
  });

  test('contains 2 Skip per color (8 total)', () => {
    const skips = deck.filter(c => c.value === 'skip');
    expect(skips.length).toBe(8);
    for (const color of ['red', 'green', 'blue', 'yellow']) {
      expect(skips.filter(c => c.color === color).length).toBe(2);
    }
  });

  test('contains 2 Reverse per color (8 total)', () => {
    const reverses = deck.filter(c => c.value === 'reverse');
    expect(reverses.length).toBe(8);
  });

  test('contains 2 Draw Two per color (8 total)', () => {
    const dt = deck.filter(c => c.value === 'draw_two');
    expect(dt.length).toBe(8);
  });

  test('contains 4 Wild cards', () => {
    expect(deck.filter(c => c.value === 'wild').length).toBe(4);
  });

  test('contains 4 Wild Draw Four cards', () => {
    expect(deck.filter(c => c.value === 'wild_draw_four').length).toBe(4);
  });

  test('all card IDs are unique', () => {
    const ids = new Set(deck.map(c => c.id));
    expect(ids.size).toBe(108);
  });
});

describe('shuffle', () => {
  test('returns same number of cards', () => {
    const deck = createFullDeck();
    const shuffled = shuffle(deck);
    expect(shuffled.length).toBe(deck.length);
  });

  test('contains same cards (just reordered)', () => {
    const deck = createFullDeck();
    const shuffled = shuffle(deck);
    const origIds = deck.map(c => c.id).sort();
    const shuffIds = shuffled.map(c => c.id).sort();
    expect(shuffIds).toEqual(origIds);
  });

  test('produces different order from original', () => {
    const deck = createFullDeck();
    let different = false;
    for (let i = 0; i < 5; i++) {
      const shuffled = shuffle(deck);
      const origOrder = deck.map(c => c.id).join(',');
      const shuffOrder = shuffled.map(c => c.id).join(',');
      if (origOrder !== shuffOrder) {
        different = true;
        break;
      }
    }
    expect(different).toBe(true);
  });
});

describe('Deck draw', () => {
  test('removes cards from draw pile', () => {
    const d = new Deck();
    const initial = d.drawCount;
    d.draw(5);
    expect(d.drawCount).toBe(initial - 5);
  });

  test('returns correct number of cards', () => {
    const d = new Deck();
    const cards = d.draw(3);
    expect(cards.length).toBe(3);
  });

  test('draw pile shrinks by drawn amount', () => {
    const d = new Deck();
    const before = d.drawCount;
    d.draw(7);
    expect(d.drawCount).toBe(before - 7);
  });
});

describe('Deck reshuffle', () => {
  test('when draw pile is empty, reshuffles discard into draw pile', () => {
    const d = new Deck();
    // Draw all cards
    const all = d.draw(108);
    // Put them in discard
    for (const c of all) d.discard(c);
    expect(d.drawCount).toBe(0);
    expect(d.discardCount).toBe(108);

    d.reshuffle();
    // Top card stays in discard, rest go to draw
    expect(d.drawCount).toBe(107);
    expect(d.discardCount).toBe(1);
  });

  test('top card of discard remains after reshuffle', () => {
    const d = new Deck();
    const all = d.draw(108);
    for (const c of all) d.discard(c);
    const topBefore = d.discardPile[d.discardPile.length - 1];
    d.reshuffle();
    expect(d.discardPile[0].id).toBe(topBefore.id);
  });

  test('total card count is preserved', () => {
    const d = new Deck();
    // Draw all cards, then discard them all
    const all = d.draw(108);
    for (const c of all) d.discard(c);
    const totalBefore = d.drawCount + d.discardCount;
    d.reshuffle();
    const totalAfter = d.drawCount + d.discardCount;
    expect(totalAfter).toBe(totalBefore);
  });
});
