export const COLORS = ['red', 'green', 'blue', 'yellow'];
export const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw_two'];
export const WILDS = ['wild', 'wild_draw_four'];
export const ACTION_VALUES = ['skip', 'reverse', 'draw_two'];

export function canPlayOn(card, topCard, chosenColor) {
  // Wilds can always be played
  if (card.value === 'wild' || card.value === 'wild_draw_four') {
    return true;
  }

  // If top card is a wild, match against chosen color
  if (topCard.value === 'wild' || topCard.value === 'wild_draw_four') {
    return card.color === chosenColor;
  }

  // Match color or value
  return card.color === topCard.color || card.value === topCard.value;
}

export function scoreValue(card) {
  if (card.value === 'wild' || card.value === 'wild_draw_four') {
    return 50;
  }
  if (ACTION_VALUES.includes(card.value)) {
    return 20;
  }
  return parseInt(card.value, 10);
}

export function createCard(id, color, value) {
  return { id, color, value };
}
