const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT, host: '0.0.0.0' });

const messages = [];
const MAX_MESSAGES = 100;

let clientIdCounter = 0;
const clients = new Map(); // ws -> { id, nickname, wins, losses, bannedUntil, duel }
const wsById = new Map();   // id -> ws

function sendTo(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload) {
  wss.clients.forEach(ws => sendTo(ws, payload));
}

function getOnlinePlayers() {
  const now = Date.now();
  return [...clients.values()]
    .filter(c => !c.bannedUntil || c.bannedUntil < now)
    .map(c => ({ id: c.id, nickname: c.nickname, wins: c.wins, losses: c.losses }));
}

function determineWinner(choice1, choice2) {
  if (choice1 === choice2) return 'draw';
  if (
    (choice1 === 'rock' && choice2 === 'scissors') ||
    (choice1 === 'scissors' && choice2 === 'paper') ||
    (choice1 === 'paper' && choice2 === 'rock')
  ) {
    return 'player1';
  }
  return 'player2';
}

wss.on('connection', ws => {
  const client = {
    id: clientIdCounter++,
    nickname: 'Аноним',
    wins: 0,
    losses: 0,
    bannedUntil: null,
    duel: null,
  };
  clients.set(ws, client);
  wsById.set(client.id, ws);

  console.log('Новый участник:', client.id);

  ws.send(JSON.stringify({ type: 'history', data: messages }));
  broadcast({ type: 'players', data: getOnlinePlayers() });

  ws.on('message', data => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      return;
    }

    const current = clients.get(ws);
    if (!current) return;

    if (current.bannedUntil && current.bannedUntil > Date.now()) {
      sendTo(ws, { type: 'banned', data: { until: current.bannedUntil } });
      return;
    }

    switch (msg.type) {
      case 'join': {
        current.nickname = msg.data.nickname || 'Аноним';
        broadcast({ type: 'players', data: getOnlinePlayers() });
        break;
      }

      case 'message': {
        const { nickname, text } = msg.data;
        const message = { nickname: current.nickname, text, time: Date.now() };
        messages.push(message);
        if (messages.length > MAX_MESSAGES) messages.shift();
        broadcast({ type: 'message', data: message });
        break;
      }

      case 'duel_request': {
        const targetId = msg.data.targetId;
        const targetWs = wsById.get(targetId);
        if (!targetWs) break;
        const target = clients.get(targetWs);
        if (!target || target.id === current.id) break;
        if (target.bannedUntil && target.bannedUntil > Date.now()) break;

        sendTo(targetWs, {
          type: 'duel_invite',
          data: { fromId: current.id, fromNick: current.nickname },
        });
        break;
      }

      case 'duel_accept': {
        const fromId = msg.data.fromId;
        const challengerWs = wsById.get(fromId);
        if (!challengerWs) break;
        const challenger = clients.get(challengerWs);
        if (!challenger) break;

        current.duel = { opponent: challenger, choice: null };
        challenger.duel = { opponent: current, choice: null };

        sendTo(ws, { type: 'duel_start', data: { opponentNick: challenger.nickname } });
        sendTo(challengerWs, { type: 'duel_start', data: { opponentNick: current.nickname } });
        break;
      }

      case 'duel_choice': {
        if (!current.duel) break;
        current.duel.choice = msg.data.choice;
        const opponent = current.duel.opponent;
        if (opponent.duel && opponent.duel.choice) {
          const result = determineWinner(current.duel.choice, opponent.duel.choice);
          const wsCurrent = wsById.get(current.id);
          const wsOpponent = wsById.get(opponent.id);

          if (result === 'player1') {
            current.wins += 1;
            opponent.losses += 1;
            opponent.bannedUntil = Date.now() + 60000; // бан 60 сек
            sendTo(wsCurrent, { type: 'duel_result', data: { result: 'win', opponentNick: opponent.nickname } });
            sendTo(wsOpponent, { type: 'duel_result', data: { result: 'lose', opponentNick: current.nickname } });
            sendTo(wsOpponent, { type: 'banned', data: { until: opponent.bannedUntil } });
          } else if (result === 'player2') {
            opponent.wins += 1;
            current.losses += 1;
            current.bannedUntil = Date.now() + 60000;
            sendTo(wsOpponent, { type: 'duel_result', data: { result: 'win', opponentNick: current.nickname } });
            sendTo(wsCurrent, { type: 'duel_result', data: { result: 'lose', opponentNick: opponent.nickname } });
            sendTo(wsCurrent, { type: 'banned', data: { until: current.bannedUntil } });
          } else {
            sendTo(wsCurrent, { type: 'duel_result', data: { result: 'draw', opponentNick: opponent.nickname } });
            sendTo(wsOpponent, { type: 'duel_result', data: { result: 'draw', opponentNick: current.nickname } });
          }

          current.duel = null;
          opponent.duel = null;
          broadcast({ type: 'players', data: getOnlinePlayers() });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    wsById.delete(client.id);
    broadcast({ type: 'players', data: getOnlinePlayers() });
    console.log('Участник вышел:', client.id);
  });
});