import { connect, send } from './ws.js';
import { showToast } from './renderer.js';
import * as startScreen from './screens/start.js';
import * as lobbyScreen from './screens/lobby.js';
import * as gameScreen from './screens/game.js';

let myPlayerId = null;
let initialized = false;

window.showScreen = function(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add('active');
};

startScreen.init();

function detectPlayerId(msg) {
  if (myPlayerId) return;

  if (msg.type === 'room_created' && msg.players) {
    const host = msg.players.find(p => p.isHost);
    if (host) myPlayerId = host.id;
  } else if (msg.type === 'room_joined' && msg.players) {
    myPlayerId = msg.players[msg.players.length - 1].id;
  }

  if (myPlayerId && !initialized) {
    lobbyScreen.init(myPlayerId);
    gameScreen.init(myPlayerId);
    initialized = true;
  }
}

connect((msg) => {
  detectPlayerId(msg);

  switch (msg.type) {
    case 'room_created':
      lobbyScreen.updateLobby(msg);
      window.showScreen('lobby');
      break;

    case 'room_joined':
      lobbyScreen.updateLobby(msg);
      if (msg.playAgain) {
        document.getElementById('overlay-results').style.display = 'none';
      }
      window.showScreen('lobby');
      break;

    case 'player_joined':
      lobbyScreen.updatePlayerList(msg.players);
      showToast(`${msg.playerName} joined!`, 'info');
      break;

    case 'player_left':
      if (msg.players) lobbyScreen.updatePlayerList(msg.players);
      gameScreen.handleMessage(msg);
      break;

    case 'host_changed':
      showToast('Host changed', 'info');
      break;

    case 'game_started':
      gameScreen.updateGameState(msg);
      window.showScreen('game');
      break;

    case 'error':
      showToast(msg.message, 'error');
      break;

    default:
      gameScreen.handleMessage(msg);
      break;
  }
});
