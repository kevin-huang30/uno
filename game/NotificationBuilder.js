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
