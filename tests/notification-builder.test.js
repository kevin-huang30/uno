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
