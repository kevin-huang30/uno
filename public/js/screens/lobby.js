import { send } from '../ws.js';

let currentPlayerId = null;

export function init(playerId) {
  currentPlayerId = playerId;

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('lobby-code').textContent;
    navigator.clipboard.writeText(code).catch(() => {});
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    send({ type: 'start_game' });
  });

  document.getElementById('btn-leave').addEventListener('click', () => {
    send({ type: 'leave_game' });
    window.showScreen('start');
  });
}

export function updateLobby(data) {
  document.getElementById('lobby-code').textContent = data.code;
  document.getElementById('lobby-rounds').textContent = data.totalRounds || 1;
  updatePlayerList(data.players);
}

export function updatePlayerList(players) {
  const list = document.getElementById('player-list');
  list.innerHTML = '';

  const isHost = players.some(p => p.id === currentPlayerId && p.isHost);

  players.forEach(p => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name + (p.id === currentPlayerId ? ' (you)' : '');
    li.appendChild(nameSpan);

    if (p.isHost) {
      const badge = document.createElement('span');
      badge.className = 'host-badge';
      badge.textContent = 'Host';
      li.appendChild(badge);
    }
    list.appendChild(li);
  });

  const btnStart = document.getElementById('btn-start');
  const waiting = document.getElementById('lobby-waiting');

  if (isHost) {
    btnStart.style.display = 'block';
    btnStart.disabled = players.length < 2;
    waiting.style.display = 'none';
  } else {
    btnStart.style.display = 'none';
    waiting.style.display = 'block';
  }
}

export function setPlayerId(id) {
  currentPlayerId = id;
}
