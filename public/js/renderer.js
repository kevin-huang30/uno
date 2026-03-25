const VALUE_DISPLAY = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  'skip': '⊘',
  'reverse': '⇄',
  'draw_two': '+2',
  'wild': '★',
  'wild_draw_four': '+4',
};

const VALUE_LABEL = {
  'skip': 'SKIP',
  'reverse': 'REVERSE',
  'draw_two': 'DRAW 2',
  'wild': 'WILD',
  'wild_draw_four': 'WILD +4',
};

export function createCardElement(card, options = {}) {
  const el = document.createElement('div');
  const isWild = card.value === 'wild' || card.value === 'wild_draw_four';
  el.className = `card ${isWild ? 'wild' : card.color || ''}`;
  el.dataset.cardId = card.id;

  const valueEl = document.createElement('span');
  valueEl.className = 'card-value';
  valueEl.textContent = VALUE_DISPLAY[card.value] || card.value;
  el.appendChild(valueEl);

  const label = VALUE_LABEL[card.value];
  if (label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'card-label';
    labelEl.textContent = label;
    el.appendChild(labelEl);
  }

  // Corner value indicator
  const isWildDraw4 = card.value === 'wild_draw_four';
  if (isWild) {
    const corner = document.createElement('div');
    corner.className = 'card-corner card-corner-wild';
    const grid = document.createElement('div');
    grid.className = 'color-grid';
    grid.innerHTML = '<span></span><span></span><span></span><span></span>';
    corner.appendChild(grid);
    if (isWildDraw4) {
      const wd4 = document.createElement('span');
      wd4.className = 'wd4-label';
      wd4.textContent = '+4';
      corner.appendChild(wd4);
    }
    el.appendChild(corner);
  } else {
    const corner = document.createElement('span');
    corner.className = 'card-corner';
    corner.textContent = VALUE_DISPLAY[card.value] || card.value;
    el.appendChild(corner);
  }

  if (options.playable) el.classList.add('playable');
  if (options.dimmed) el.classList.add('dimmed');
  if (options.animate) el.classList.add('card-enter');
  if (options.onClick) el.addEventListener('click', () => options.onClick(card));

  return el;
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
