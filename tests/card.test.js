import { describe, test, expect } from 'bun:test';
import { canPlayOn, scoreValue, createCard } from '../game/Card.js';

describe('canPlayOn', () => {
  test('same color, different value -> playable', () => {
    const card = createCard('1', 'red', '3');
    const top = createCard('2', 'red', '7');
    expect(canPlayOn(card, top, null)).toBe(true);
  });

  test('different color, same number -> playable', () => {
    const card = createCard('1', 'blue', '5');
    const top = createCard('2', 'red', '5');
    expect(canPlayOn(card, top, null)).toBe(true);
  });

  test('different color, same action (skip on skip) -> playable', () => {
    const card = createCard('1', 'green', 'skip');
    const top = createCard('2', 'red', 'skip');
    expect(canPlayOn(card, top, null)).toBe(true);
  });

  test('different color, different value -> not playable', () => {
    const card = createCard('1', 'blue', '3');
    const top = createCard('2', 'red', '7');
    expect(canPlayOn(card, top, null)).toBe(false);
  });

  test('wild on any card -> playable', () => {
    const card = createCard('1', null, 'wild');
    const top = createCard('2', 'red', '7');
    expect(canPlayOn(card, top, null)).toBe(true);
  });

  test('wild draw four on any card -> playable', () => {
    const card = createCard('1', null, 'wild_draw_four');
    const top = createCard('2', 'green', 'skip');
    expect(canPlayOn(card, top, null)).toBe(true);
  });

  test('any card on wild when chosenColor matches -> playable', () => {
    const card = createCard('1', 'red', '3');
    const top = createCard('2', null, 'wild');
    expect(canPlayOn(card, top, 'red')).toBe(true);
  });

  test('any card on wild when chosenColor does not match -> not playable', () => {
    const card = createCard('1', 'red', '3');
    const top = createCard('2', null, 'wild');
    expect(canPlayOn(card, top, 'blue')).toBe(false);
  });
});

describe('scoreValue', () => {
  test('number cards return face value (0-9)', () => {
    for (let i = 0; i <= 9; i++) {
      const card = createCard('1', 'red', String(i));
      expect(scoreValue(card)).toBe(i);
    }
  });

  test('skip returns 20', () => {
    expect(scoreValue(createCard('1', 'red', 'skip'))).toBe(20);
  });

  test('reverse returns 20', () => {
    expect(scoreValue(createCard('1', 'red', 'reverse'))).toBe(20);
  });

  test('draw two returns 20', () => {
    expect(scoreValue(createCard('1', 'red', 'draw_two'))).toBe(20);
  });

  test('wild returns 50', () => {
    expect(scoreValue(createCard('1', null, 'wild'))).toBe(50);
  });

  test('wild draw four returns 50', () => {
    expect(scoreValue(createCard('1', null, 'wild_draw_four'))).toBe(50);
  });
});
