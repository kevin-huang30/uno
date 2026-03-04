let ws = null;
let messageHandler = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;

export function connect(onMessage) {
  messageHandler = onMessage;
  _connect();
}

function _connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (messageHandler) messageHandler(msg);
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  };

  ws.onclose = () => {
    _scheduleReconnect();
  };

  ws.onerror = () => {
    ws.close();
  };
}

function _scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
  reconnectTimer = setTimeout(() => {
    reconnectAttempts++;
    _connect();
  }, RECONNECT_DELAY);
}

export function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}
