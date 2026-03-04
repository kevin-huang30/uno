import { send } from '../ws.js';

let selectedRounds = 1;

export function init() {
  const nameInput = document.getElementById('player-name');
  const codeInput = document.getElementById('room-code-input');
  const btnHost = document.getElementById('btn-host');
  const btnJoin = document.getElementById('btn-join');
  const roundBtns = document.querySelectorAll('.btn-round');

  roundBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      roundBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRounds = parseInt(btn.dataset.rounds);
    });
  });

  btnHost.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    send({ type: 'host_game', name, rounds: selectedRounds });
  });

  btnJoin.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();
    if (!name) {
      nameInput.focus();
      return;
    }
    if (!code || code.length !== 4) {
      codeInput.focus();
      return;
    }
    send({ type: 'join_game', name, code });
  });

  // Enter key handlers
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnHost.click();
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnJoin.click();
  });
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase();
  });
}

export function getRounds() {
  return selectedRounds;
}
