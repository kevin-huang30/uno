import { send } from '../ws.js';
import { createCardElement, showToast } from '../renderer.js';

let myId = null;
let gameState = null;
let calledUno = false;
let mobileMode = localStorage.getItem('uno-view-mode') === 'mobile';

// Notification queue
const notifQueue = [];
let notifActive = false;

export function init(playerId) {
  myId = playerId;

  document.getElementById('draw-pile').addEventListener('click', () => {
    if (!gameState || gameState.currentPlayerId !== myId) return;
    send({ type: 'draw_card' });
  });

  document.getElementById('btn-uno').addEventListener('click', () => {
    calledUno = true;
    send({ type: 'call_uno' });
    document.getElementById('btn-uno').style.display = 'none';
    showToast('UNO!', 'info');
  });

  document.getElementById('btn-play-drawn').addEventListener('click', () => {
    const card = gameState?._drawnCard;
    if (card) {
      if (card.value === 'wild' || card.value === 'wild_draw_four') {
        gameState._pendingPlayCardId = card.id;
        showColorPicker();
      } else {
        send({ type: 'play_card', cardId: card.id, callUno: calledUno });
        calledUno = false;
      }
    }
    document.getElementById('drawn-card-prompt').style.display = 'none';
  });

  document.getElementById('btn-keep-drawn').addEventListener('click', () => {
    send({ type: 'keep_card' });
    document.getElementById('drawn-card-prompt').style.display = 'none';
  });

  // Color picker buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      document.getElementById('color-picker').style.display = 'none';

      if (gameState?._pendingPlayCardId) {
        send({ type: 'play_card', cardId: gameState._pendingPlayCardId, callUno: calledUno });
        calledUno = false;
        // Send color choice right after
        setTimeout(() => send({ type: 'choose_color', color }), 50);
        gameState._pendingPlayCardId = null;
      } else {
        send({ type: 'choose_color', color });
      }
    });
  });

  // WD4 challenge/accept
  document.getElementById('btn-challenge-wd4').addEventListener('click', () => {
    send({ type: 'challenge_wd4' });
    document.getElementById('wd4-modal').style.display = 'none';
  });

  document.getElementById('btn-accept-wd4').addEventListener('click', () => {
    send({ type: 'accept_wd4' });
    document.getElementById('wd4-modal').style.display = 'none';
  });

  // Results overlay buttons
  document.getElementById('btn-next-round').addEventListener('click', () => {
    send({ type: 'next_round' });
    document.getElementById('overlay-results').style.display = 'none';
  });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    send({ type: 'play_again' });
    document.getElementById('overlay-results').style.display = 'none';
  });

  // View mode toggle
  const viewToggle = document.getElementById('view-mode-toggle');
  const gameContainer = document.querySelector('.game-container');
  if (viewToggle) {
    viewToggle.checked = mobileMode;
    if (mobileMode) gameContainer.classList.add('mobile-mode');

    viewToggle.addEventListener('change', () => {
      mobileMode = viewToggle.checked;
      localStorage.setItem('uno-view-mode', mobileMode ? 'mobile' : 'pc');
      gameContainer.classList.toggle('mobile-mode', mobileMode);
      renderHand();
    });
  }
}

export function setPlayerId(id) {
  myId = id;
}

export function updateGameState(state) {
  notifQueue.length = 0;
  notifActive = false;
  gameState = state;
  const gameContainer = document.querySelector('.game-container');
  if (gameContainer && mobileMode) gameContainer.classList.add('mobile-mode');
  calledUno = false;
  renderAll();
}

function showNotification({ text, subtext, cardColor, type }) {
  notifQueue.push({ text, subtext, cardColor, type });
  if (!notifActive) _drainNotifQueue();
}

function _drainNotifQueue() {
  if (notifQueue.length === 0) {
    notifActive = false;
    return;
  }
  notifActive = true;
  const { text, subtext, cardColor, type } = notifQueue.shift();

  const el = document.getElementById('notification');
  if (!el) { notifActive = false; return; }
  const textEl = el.querySelector('.notification-text');
  const subtextEl = el.querySelector('.notification-subtext');

  // Reset classes
  el.className = 'notification';
  el.classList.add(`type-${type}`);
  el.classList.add(`color-${cardColor}`);  // color-null for null

  textEl.textContent = text;
  subtextEl.textContent = subtext ?? '';

  el.style.display = 'block';
  el.classList.add('anim-in');

  // Duration: uno uses CSS animation (1.5s pulse + 0.2s fadeout), others use 2.5s hold
  const holdMs = type === 'uno' ? 1700 : 2500;

  setTimeout(() => {
    el.classList.remove('anim-in');
    el.classList.add('anim-out');
    setTimeout(() => {
      el.style.display = 'none';
      el.className = 'notification';
      _drainNotifQueue();
    }, 200);
  }, holdMs);
}

export function handleMessage(msg) {
  switch (msg.type) {
    case 'card_played':
      handleCardPlayed(msg);
      break;
    case 'card_drawn':
      handleCardDrawn(msg);
      break;
    case 'draw_result':
      handleDrawResult(msg);
      break;
    case 'turn_changed':
      handleTurnChanged(msg);
      break;
    case 'direction_changed':
      handleDirectionChanged(msg);
      break;
    case 'color_chosen':
      handleColorChosen(msg);
      break;
    case 'waiting_for_color':
      showColorPicker();
      break;
    case 'drawn_card_playable':
      showDrawnCardPrompt(msg.card);
      break;
    case 'player_skip':
      handlePlayerSkip(msg);
      break;
    case 'draw_penalty':
      handleDrawPenalty(msg);
      break;
    case 'uno_called':
      showToast(`${msg.playerName} called UNO!`, 'info');
      break;
    case 'uno_caught':
      showToast(`${msg.catcherName} caught ${msg.targetName}! +2 cards`, 'info');
      if (msg.targetId === myId) updateHandFromServer();
      break;
    case 'challenge_result':
      handleChallengeResult(msg);
      break;
    case 'round_over':
    case 'game_over':
      showResults(msg);
      break;
    case 'player_left':
      if (msg.disconnected) {
        showToast(`${msg.playerName} disconnected`, 'error');
      } else {
        showToast(`${msg.playerName} left`, 'info');
      }
      break;
    case 'move_notification':
      showNotification(msg);
      break;
    case 'player_rejoined': {
      // Update the opponent's card count using the same pattern as existing handlers
      // (opponents are rendered from gameState, no data-player-id attribute exists in the DOM)
      const opp = gameState.opponents?.find(o => o.id === msg.playerId);
      if (opp) {
        opp.cardCount = msg.cardCount;
        renderOpponents();
      }
      break;
    }
  }
}

function renderAll() {
  if (!gameState) return;
  renderOpponents();
  renderPiles();
  renderHand();
  renderGameInfo();
  renderTurnIndicator();
  renderUnoButton();
}

function renderOpponents() {
  const container = document.getElementById('opponents');
  container.innerHTML = '';

  for (const opp of gameState.opponents) {
    const div = document.createElement('div');
    div.className = 'opponent' + (opp.id === gameState.currentPlayerId ? ' active-turn' : '');

    const name = document.createElement('div');
    name.className = 'opp-name';
    name.textContent = opp.name;
    div.appendChild(name);

    const cards = document.createElement('div');
    cards.className = 'opp-cards';
    cards.textContent = `${opp.cardCount} 🃏`;
    div.appendChild(cards);

    if (opp.cardCount === 1) {
      const uno = document.createElement('div');
      uno.className = 'opp-uno';
      uno.textContent = 'UNO!';
      div.appendChild(uno);

      // Click to catch
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => {
        send({ type: 'catch_uno', targetId: opp.id });
      });
    }

    container.appendChild(div);
  }
}

function renderPiles() {
  const discardSlot = document.getElementById('discard-pile');
  discardSlot.innerHTML = '';

  if (gameState.topCard) {
    const cardEl = createCardElement(gameState.topCard);
    cardEl.classList.remove('card');
    // Copy classes to the slot itself
    discardSlot.className = `card pile discard-slot has-card ${gameState.topCard.value === 'wild' || gameState.topCard.value === 'wild_draw_four' ? 'wild' : gameState.topCard.color}`;

    const valueEl = document.createElement('span');
    valueEl.className = 'card-value';
    const vd = { '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9','skip':'⊘','reverse':'⇄','draw_two':'+2','wild':'★','wild_draw_four':'+4' };
    valueEl.textContent = vd[gameState.topCard.value] || gameState.topCard.value;
    discardSlot.appendChild(valueEl);

    const vl = { 'skip':'SKIP','reverse':'REVERSE','draw_two':'DRAW 2','wild':'WILD','wild_draw_four':'WILD +4' };
    if (vl[gameState.topCard.value]) {
      const labelEl = document.createElement('span');
      labelEl.className = 'card-label';
      labelEl.textContent = vl[gameState.topCard.value];
      discardSlot.appendChild(labelEl);
    }
  }

  document.getElementById('draw-count').textContent = gameState.drawPileCount;
}

function renderHand() {
  const container = document.getElementById('player-hand');
  container.innerHTML = '';

  const isMyTurn = gameState.currentPlayerId === myId;
  const hand = gameState.hand || [];

  // Sort hand: by color, then by value
  const sorted = [...hand].sort((a, b) => {
    const colorOrder = { red: 0, green: 1, blue: 2, yellow: 3 };
    const ca = a.color ? colorOrder[a.color] : 5;
    const cb = b.color ? colorOrder[b.color] : 5;
    if (ca !== cb) return ca - cb;
    return (a.value || '').localeCompare(b.value || '');
  });

  const n = sorted.length;

  // Read responsive card dimensions from CSS variables
  const rootStyle = getComputedStyle(document.documentElement);
  const cardWidth = parseFloat(rootStyle.getPropertyValue('--card-width')) || 80;
  const cardHeight = parseFloat(rootStyle.getPropertyValue('--card-height')) || 115;
  const halfCardWidth = cardWidth / 2;

  // Arc parameters — mobile uses wider spread so cards don't overlap for touch
  const degreesPerCard = mobileMode ? 14 : 10;
  // Visual rotation is gentler than the positional spacing
  const rotDegreesPerCard = mobileMode ? 4 : 5;
  const totalArc = (n - 1) * degreesPerCard;
  const startDeg = -totalArc / 2;
  const totalRotArc = (n - 1) * rotDegreesPerCard;
  const startRotDeg = -totalRotArc / 2;
  const arcHeight = 30; // px — center card this much higher than edges

  // Compute R so the outermost card's far corner stays within the container.
  // A card at angle θ (rotated around its bottom-center at xOffset = R·sin θ) has its
  // far top corner at: xOffset + halfCardWidth·cos θ + cardHeight·sin θ
  // That must be ≤ containerWidth/2, so:
  //   R ≤ (containerWidth/2 - halfCardWidth·cos θ - cardHeight·sin θ) / sin θ
  // Subtract game-container's 8px padding on each side from the fallback;
  // offsetWidth is 0 if the screen hasn't been laid out yet
  const containerWidth = container.offsetWidth || (window.innerWidth - 16);
  const maxAngleRad = Math.abs(startDeg) * Math.PI / 180;
  let R = 600;
  if (maxAngleRad > 0.01) {
    const maxR = (containerWidth / 2 - halfCardWidth * Math.cos(maxAngleRad) - cardHeight * Math.sin(maxAngleRad)) / Math.sin(maxAngleRad);
    // Mobile: allow lower min R so cards stay spread even with many cards
    const minR = mobileMode ? 50 : 80;
    R = Math.min(600, Math.max(maxR, minR));
  }

  sorted.forEach((card, i) => {
    const playable = isMyTurn && canPlayLocally(card);
    const cardEl = createCardElement(card, {
      playable,
      dimmed: isMyTurn && !playable,
      // PC mode: click to play directly. Mobile: handled below.
      onClick: (!mobileMode && playable) ? () => playCardFromHand(card) : null,
    });

    // Position card along the arc (spacing), but rotate less (visual tilt)
    const angleDeg = startDeg + i * degreesPerCard;
    const angleRad = angleDeg * Math.PI / 180;
    const rotDeg = startRotDeg + i * rotDegreesPerCard;
    const xOffset = R * Math.sin(angleRad);
    const yOffset = n > 1 ? arcHeight * Math.cos(angleRad) : 0;

    cardEl.style.left = `calc(50% + ${xOffset}px - ${halfCardWidth}px)`;
    cardEl.style.bottom = `${yOffset}px`;
    cardEl.style.transform = `rotate(${rotDeg}deg)`;
    cardEl.style.setProperty('--rot', `rotate(${rotDeg}deg)`);
    cardEl.style.zIndex = String(i + 1);

    // Mobile: tap to select (pop up), swipe up to play
    if (mobileMode && playable) {
      cardEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // Deselect any previously selected card
        const prev = container.querySelector('.card.selected');
        if (prev && prev !== cardEl) {
          prev.classList.remove('selected');
          prev.style.transform = prev.dataset.baseTransform;
          prev.style.zIndex = prev.dataset.baseZ;
        }
        // Toggle selection
        if (cardEl.classList.contains('selected')) {
          cardEl.classList.remove('selected');
          cardEl.style.transform = cardEl.dataset.baseTransform;
          cardEl.style.zIndex = cardEl.dataset.baseZ;
        } else {
          cardEl.dataset.baseTransform = cardEl.style.transform;
          cardEl.dataset.baseZ = cardEl.style.zIndex;
          cardEl.classList.add('selected');
          cardEl.style.transform = `rotate(${rotDeg}deg) translateY(-40px)`;
          cardEl.style.zIndex = '30';
        }
      });

      // Swipe up to play the selected card
      let touchStartY = 0;
      cardEl.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });
      cardEl.addEventListener('touchend', (e) => {
        if (!cardEl.classList.contains('selected')) return;
        const dy = touchStartY - e.changedTouches[0].clientY;
        if (dy > 30) {
          // Swiped up — play the card
          playCardFromHand(card);
        }
      });
    }

    container.appendChild(cardEl);
  });

  // Mobile: tap outside cards to deselect
  if (mobileMode) {
    container.addEventListener('click', (e) => {
      if (e.target === container) {
        const sel = container.querySelector('.card.selected');
        if (sel) {
          sel.classList.remove('selected');
          sel.style.transform = sel.dataset.baseTransform;
          sel.style.zIndex = sel.dataset.baseZ;
        }
      }
    });
  }
}

function renderGameInfo() {
  const dirEl = document.getElementById('direction-indicator');
  dirEl.className = 'direction' + (gameState.direction === -1 ? ' ccw' : '');

  const colorEl = document.getElementById('current-color');
  colorEl.className = 'current-color';
  const activeColor = gameState.chosenColor || gameState.topCard?.color;
  if (activeColor) colorEl.classList.add(activeColor);

  const roundEl = document.getElementById('round-info');
  if (gameState.totalRounds > 1) {
    roundEl.textContent = `Round ${gameState.currentRound}/${gameState.totalRounds}`;
  } else {
    roundEl.textContent = '';
  }
}

function renderTurnIndicator() {
  const el = document.getElementById('turn-indicator');
  if (gameState.currentPlayerId === myId) {
    el.textContent = 'Your turn!';
    el.style.color = '#2ecc71';
  } else {
    const opp = gameState.opponents.find(o => o.id === gameState.currentPlayerId);
    el.textContent = opp ? `${opp.name}'s turn` : '';
    el.style.color = '#95a5a6';
  }
}

function renderUnoButton() {
  const btn = document.getElementById('btn-uno');
  const hand = gameState.hand || [];
  // Show UNO button when player has 2 cards and it's their turn (about to play down to 1)
  if (hand.length === 2 && gameState.currentPlayerId === myId) {
    btn.style.display = 'block';
  } else if (hand.length === 1 && !calledUno) {
    // Briefly show to let them call after playing
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
  }
}

function canPlayLocally(card) {
  if (!gameState.topCard) return true;
  if (card.value === 'wild' || card.value === 'wild_draw_four') return true;
  const tc = gameState.topCard;
  if (tc.value === 'wild' || tc.value === 'wild_draw_four') {
    return card.color === gameState.chosenColor;
  }
  return card.color === tc.color || card.value === tc.value;
}

function playCardFromHand(card) {
  if (card.value === 'wild' || card.value === 'wild_draw_four') {
    gameState._pendingPlayCardId = card.id;
    showColorPicker();
    return;
  }
  send({ type: 'play_card', cardId: card.id, callUno: calledUno });
  calledUno = false;
}

function showColorPicker() {
  document.getElementById('color-picker').style.display = 'flex';
}

function showDrawnCardPrompt(card) {
  if (!gameState) return;
  gameState._drawnCard = card;

  const display = document.getElementById('drawn-card-display');
  display.innerHTML = '';
  display.appendChild(createCardElement(card));

  document.getElementById('drawn-card-prompt').style.display = 'block';
}

function handleCardPlayed(msg) {
  if (!gameState) return;

  // Update top card
  gameState.topCard = msg.card;

  // Update opponent card count
  const opp = gameState.opponents.find(o => o.id === msg.playerId);
  if (opp) opp.cardCount = msg.cardCount;

  // Remove card from own hand if it was us
  if (msg.playerId === myId) {
    gameState.hand = gameState.hand.filter(c => c.id !== msg.card.id);
  }

  renderPiles();
  renderOpponents();
  if (msg.playerId === myId) renderHand();
}

function handleCardDrawn(msg) {
  if (!gameState) return;
  const opp = gameState.opponents.find(o => o.id === msg.playerId);
  if (opp) opp.cardCount = msg.cardCount;
  renderOpponents();
}

function handleDrawResult(msg) {
  if (!gameState) return;

  if (msg.cards) {
    // Multiple cards (penalty)
    gameState.hand.push(...msg.cards);
  } else if (msg.card) {
    // Single draw - card already added server-side, just update local state
    // (hand will be re-rendered)
    const exists = gameState.hand.find(c => c.id === msg.card.id);
    if (!exists) gameState.hand.push(msg.card);
  }

  renderHand();
  renderUnoButton();
}

function handleTurnChanged(msg) {
  if (!gameState) return;
  gameState.currentPlayerId = msg.currentPlayerId;
  renderAll();
}

function handleDirectionChanged(msg) {
  if (!gameState) return;
  gameState.direction = msg.direction;
  renderGameInfo();
}

function handleColorChosen(msg) {
  if (!gameState) return;
  gameState.chosenColor = msg.color;
  renderGameInfo();
  renderHand();
}

function handlePlayerSkip(msg) {
  if (msg.playerId === myId) {
    showToast('Your turn was skipped!', 'info');
  } else {
    const opp = gameState?.opponents.find(o => o.id === msg.playerId);
    if (opp) showToast(`${opp.name} was skipped`, 'info');
  }
}

function handleDrawPenalty(msg) {
  if (msg.canChallenge) {
    const wd4Modal = document.getElementById('wd4-modal');
    document.getElementById('wd4-text').textContent = 'You can challenge if you think they had matching color cards.';
    wd4Modal.style.display = 'flex';
  }
}

function handleChallengeResult(msg) {
  if (msg.success) {
    showToast('Challenge successful! Challenger was right.', 'info');
  } else {
    showToast('Challenge failed! Challenger draws 6.', 'info');
  }
}

function showResults(msg) {
  const overlay = document.getElementById('overlay-results');
  const title = document.getElementById('results-title');
  const winner = document.getElementById('results-winner');
  const scoresDiv = document.getElementById('results-scores');
  const handsDiv = document.getElementById('results-hands');

  title.textContent = msg.type === 'game_over' ? 'Game Over!' : 'Round Over!';
  winner.textContent = `${msg.winnerName} wins${msg.type === 'game_over' ? ' the game' : ' the round'}!`;

  // Scores
  scoresDiv.innerHTML = '';
  const sortedScores = Object.entries(msg.scores)
    .sort(([,a], [,b]) => b - a);

  for (const [pid, score] of sortedScores) {
    const player = msg.players?.find(p => p.id === pid);
    const row = document.createElement('div');
    row.className = 'score-row';
    row.innerHTML = `<span class="score-name">${player?.name || pid}</span><span class="score-value">${score}</span>`;
    scoresDiv.appendChild(row);
  }

  // Show remaining hands
  handsDiv.innerHTML = '';
  if (msg.hands) {
    for (const [pid, cards] of Object.entries(msg.hands)) {
      if (cards.length === 0) continue;
      const player = msg.players?.find(p => p.id === pid);
      const div = document.createElement('div');
      div.innerHTML = `<strong>${player?.name || pid}:</strong> ${cards.length} cards remaining`;
      handsDiv.appendChild(div);
    }
  }

  // Buttons
  const btnNext = document.getElementById('btn-next-round');
  const btnPlayAgain = document.getElementById('btn-play-again');

  // Check if current player is host
  const isHost = msg.players?.some(p => p.id === myId && p.isHost);

  if (msg.type === 'game_over') {
    btnNext.style.display = 'none';
    btnPlayAgain.style.display = isHost ? 'block' : 'none';
  } else {
    btnNext.style.display = isHost ? 'block' : 'none';
    btnPlayAgain.style.display = 'none';
  }

  overlay.style.display = 'flex';
}

function updateHandFromServer() {
  // Request full game state refresh (could be done, but for now toast is enough)
}
