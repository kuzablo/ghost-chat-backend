require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const VERSION = '2.3.0';
const PORT = process.env.PORT || 3000;
const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 минуты бездействия

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET;

const app = express();
app.use(cors());
app.use(express.json());

// Регистрация
app.post('/api/register', async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) {
    return res.status(400).json({ error: 'Nickname and password required' });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('nickname', nickname)
    .single();

  if (existing) {
    return res.status(409).json({ error: 'Nickname already taken' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from('users')
    .insert([{ nickname, password_hash }])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const token = jwt.sign({ userId: user.id, nickname: user.nickname }, JWT_SECRET);
  res.json({ token, nickname: user.nickname });
});

// Вход
app.post('/api/login', async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) {
    return res.status(400).json({ error: 'Nickname and password required' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('nickname', nickname)
    .single();

  if (!user) {
    return res.status(401).json({ error: 'Invalid nickname or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid nickname or password' });
  }

  const token = jwt.sign({ userId: user.id, nickname: user.nickname }, JWT_SECRET);
  res.json({ token, nickname: user.nickname });
});

const server = app.listen(PORT, () => {
  console.log(`[CHAT v${VERSION}] HTTP server listening on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

const messages = [];
const MAX_MESSAGES = 100;

let clientIdCounter = 0;
const clients = new Map(); // ws -> { id, userId, nickname, wins, losses, bannedUntil, duel, isTyping, lastActivity, pendingInviteTimeout }
const wsById = new Map();   // id -> ws

const log = (level, ...args) => {
  console[level](`[CHAT v${VERSION}]`, ...args);
};

function sendTo(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload, exceptWs = null) {
  wss.clients.forEach(ws => {
    if (ws !== exceptWs) sendTo(ws, payload);
  });
}

function getOnlinePlayers() {
  const now = Date.now();
  return [...clients.values()]
    .filter(c => (!c.bannedUntil || c.bannedUntil < now) && c.nickname !== 'Аноним')
    .map(c => ({ id: c.id, userId: c.userId, nickname: c.nickname, wins: c.wins, losses: c.losses }));
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

// Получение истории личных сообщений с маппингом полей
async function getPrivateHistory(userId1, userId2) {
  const { data, error } = await supabase
    .from('private_messages')
    .select('*')
    .or(`and(sender_id.eq.${userId1},recipient_id.eq.${userId2}),and(sender_id.eq.${userId2},recipient_id.eq.${userId1})`)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Ошибка загрузки истории:', error);
    return [];
  }
  // Маппим в ожидаемый клиентом формат
  return (data || []).map(msg => ({
    id: msg.id,
    senderId: msg.sender_id,
    recipientId: msg.recipient_id,
    text: msg.content,
    created_at: msg.created_at,
  }));
}

// Периодическая проверка бездействия
setInterval(() => {
  const now = Date.now();
  for (const [ws, client] of clients.entries()) {
    if (client.userId && (now - client.lastActivity) > IDLE_TIMEOUT_MS) {
      sendTo(ws, { type: 'idle_disconnect', data: { reason: 'idle' } });
      ws.close(4005, 'Idle timeout');
    }
  }
}, 10000);

wss.on('connection', ws => {
  const client = {
    id: clientIdCounter++,
    userId: null,
    nickname: 'Аноним',
    wins: 0,
    losses: 0,
    bannedUntil: null,
    duel: null,
    isTyping: false,
    pendingInviteTimeout: null,
    lastActivity: Date.now(),
  };
  clients.set(ws, client);
  wsById.set(client.id, ws);

  log('info', `Новое соединение: ${client.id}`);

  let authTimeout = setTimeout(() => {
    ws.close(4001, 'Authentication required');
  }, 10000);

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      log('error', 'Ошибка парсинга сообщения:', e.message);
      return;
    }

    const current = clients.get(ws);
    if (!current) return;

    // Обновляем lastActivity при любом сообщении
    current.lastActivity = Date.now();

    // Обработка авторизации
    if (msg.type === 'auth') {
      try {
        const decoded = jwt.verify(msg.token, JWT_SECRET);
        current.userId = decoded.userId;
        current.nickname = decoded.nickname;
        current.lastActivity = Date.now();

        const duplicate = [...clients.entries()].some(([sock, c]) => {
          return sock !== ws && c.userId === current.userId;
        });
        if (duplicate) {
          ws.close(4002, 'Already connected from another device');
          return;
        }

        clearTimeout(authTimeout);

        ws.send(JSON.stringify({ type: 'version', data: VERSION }));
        ws.send(JSON.stringify({ type: 'auth_ok', data: { nickname: current.nickname, userId: current.userId } }));
        ws.send(JSON.stringify({ type: 'history', data: messages }));
        broadcast({ type: 'players', data: getOnlinePlayers() });

        log('info', `Пользователь авторизован: ${current.nickname}`);
      } catch (err) {
        ws.close(4003, 'Invalid token');
      }
      return;
    }

    if (!current.userId) return;

    if (current.bannedUntil && current.bannedUntil > Date.now()) {
      sendTo(ws, { type: 'banned', data: { until: current.bannedUntil } });
      return;
    }

    try {
      switch (msg.type) {
        case 'message': {
          const { text } = msg.data;
          const message = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            nickname: current.nickname,
            text,
            time: Date.now(),
            reactions: {},
          };
          messages.push(message);
          if (messages.length > MAX_MESSAGES) messages.shift();
          broadcast({ type: 'message', data: message });
          break;
        }

        case 'typing': {
          current.isTyping = msg.data.isTyping;
          broadcast(
            { type: 'typing', data: { nickname: current.nickname, isTyping: current.isTyping } },
            ws,
          );
          break;
        }

        case 'reaction': {
          const { messageId, emoji } = msg.data;
          if (!messageId || !emoji) break;
          const message = messages.find(m => m.id === messageId);
          if (!message) break;

          const reactions = message.reactions || {};
          if (!reactions[emoji]) reactions[emoji] = [];
          const userIndex = reactions[emoji].indexOf(current.nickname);
          if (userIndex >= 0) {
            reactions[emoji].splice(userIndex, 1);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji].push(current.nickname);
          }

          message.reactions = reactions;
          broadcast({ type: 'message_update', data: message });
          break;
        }

        case 'private_message': {
          const { recipientId, text } = msg.data;
          if (!recipientId || !text) break;
          if (recipientId === current.userId) break;

          const recipientWs = [...clients.entries()].find(([, c]) => c.userId === recipientId)?.[0];

          const { data: savedMessage, error } = await supabase
            .from('private_messages')
            .insert([{ sender_id: current.userId, recipient_id: recipientId, content: text }])
            .select()
            .single();

          if (error) {
            log('error', 'Ошибка сохранения личного сообщения:', error.message);
            break;
          }

          // Формируем объект для клиента
          const messageForClient = {
            id: savedMessage.id,
            senderId: current.userId,
            recipientId,
            text: savedMessage.content,
            created_at: savedMessage.created_at,
          };

          // Отправляем отправителю подтверждение (и он добавит его в свой UI)
          sendTo(ws, {
            type: 'private_message_sent',
            data: messageForClient,
          });

          // Если получатель онлайн, доставляем ему
          if (recipientWs) {
            sendTo(recipientWs, {
              type: 'private_message',
              data: messageForClient,
            });
          }
          break;
        }

        case 'private_typing': {
          const { recipientId, isTyping } = msg.data;
          if (!recipientId) break;

          const recipientWs = [...clients.entries()].find(([, c]) => c.userId === recipientId)?.[0];
          if (recipientWs) {
            sendTo(recipientWs, {
              type: 'private_typing',
              data: {
                senderId: current.userId,
                senderNickname: current.nickname,
                isTyping,
              },
            });
          }
          break;
        }

        case 'private_history': {
          const { userId } = msg.data;
          if (!userId) break;
          const history = await getPrivateHistory(current.userId, userId);
          sendTo(ws, { type: 'private_history', data: { userId, messages: history } });
          break;
        }

        case 'duel_request': {
          const targetId = msg.data.targetId;
          const targetWs = wsById.get(targetId);
          if (!targetWs) break;
          const target = clients.get(targetWs);
          if (!target || target.id === current.id || target.userId === current.userId) break;
          if (target.bannedUntil && target.bannedUntil > Date.now()) break;

          if (target.pendingInviteTimeout) {
            clearTimeout(target.pendingInviteTimeout);
            target.pendingInviteTimeout = null;
          }

          sendTo(targetWs, {
            type: 'duel_invite',
            data: { fromId: current.id, fromNick: current.nickname },
          });

          sendTo(ws, {
            type: 'duel_request_sent',
            data: { targetNick: target.nickname },
          });

          target.pendingInviteTimeout = setTimeout(() => {
            if (target.pendingInviteTimeout) {
              clearTimeout(target.pendingInviteTimeout);
              target.pendingInviteTimeout = null;
              sendTo(ws, {
                type: 'duel_timeout',
                data: { targetNick: target.nickname },
              });
            }
          }, 10000);

          break;
        }

        case 'duel_accept': {
          const fromId = msg.data.fromId;
          const challengerWs = wsById.get(fromId);
          if (!challengerWs) break;
          const challenger = clients.get(challengerWs);
          if (!challenger) break;

          if (current.pendingInviteTimeout) {
            clearTimeout(current.pendingInviteTimeout);
            current.pendingInviteTimeout = null;
          }

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
              opponent.bannedUntil = Date.now() + 60000;
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
    } catch (error) {
      log('error', 'Ошибка обработки сообщения:', error);
    }
  });

  ws.on('error', err => {
    log('error', `WebSocket error (client ${client.id}):`, err.message);
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (client.pendingInviteTimeout) {
      clearTimeout(client.pendingInviteTimeout);
    }
    clients.delete(ws);
    wsById.delete(client.id);
    broadcast({ type: 'players', data: getOnlinePlayers() });
    log('info', `Соединение закрыто: ${client.id}`);
  });
});

log('info', `Сервер запущен (HTTP + WebSocket) на порту ${PORT}`);