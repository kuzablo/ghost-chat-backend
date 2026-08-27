if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const multer = require('multer');

const VERSION = '2.6.8';
const PORT = process.env.PORT || 3000;
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : supabase;

const JWT_SECRET = process.env.JWT_SECRET;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const app = express();
app.use(cors());
app.use(express.json());

// ===== ЗАГРУЗКА ФАЙЛОВ =====
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const file = req.file;
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `public/${fileName}`;

  try {
    const { data, error } = await supabaseAdmin.storage
      .from('chat-images')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('chat-images')
      .getPublicUrl(filePath);
    const publicURL = urlData?.publicUrl;

    if (!publicURL) {
      throw new Error('Public URL not generated');
    }

    console.log('✅ File uploaded, publicURL:', publicURL);
    res.json({ imageUrl: publicURL });
  } catch (err) {
    console.error('Ошибка загрузки файла:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ===== РЕГИСТРАЦИЯ =====
app.post('/api/register', async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) {
    return res.status(400).json({ error: 'Nickname and password required' });
  }

  const { data: existingUser, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('nickname', nickname)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    return res.status(500).json({ error: findError.message });
  }

  if (existingUser) {
    if (existingUser.banned_forever) {
      return res.status(403).json({ error: 'У нас тут таких не любят' });
    }
    return res.status(409).json({ error: 'Nickname already taken' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from('users')
    .insert([{ nickname, password_hash, role: 'user', banned_forever: false }])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const token = jwt.sign(
    { userId: user.id, nickname: user.nickname, role: user.role },
    JWT_SECRET
  );
  res.json({ token, nickname: user.nickname, role: user.role });
});

// ===== ВХОД =====
app.post('/api/login', async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) {
    return res.status(400).json({ error: 'Nickname and password required' });
  }

  const { data: user, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('nickname', nickname)
    .single();

  if (findError || !user) {
    return res.status(401).json({ error: 'Invalid nickname or password' });
  }

  if (user.banned_forever) {
    return res.status(403).json({ error: 'У нас тут таких не любят' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid nickname or password' });
  }

  const token = jwt.sign(
    { userId: user.id, nickname: user.nickname, role: user.role },
    JWT_SECRET
  );
  res.json({ token, nickname: user.nickname, role: user.role });
});

const server = app.listen(PORT, () => {
  console.log(`[CHAT v${VERSION}] HTTP server listening on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

const messages = [];
const MAX_MESSAGES = 100;

let clientIdCounter = 0;
const clients = new Map();
const wsById = new Map();

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
    .map(c => ({ id: c.id, userId: c.userId, nickname: c.nickname, role: c.role, wins: c.wins, losses: c.losses }));
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
  return (data || []).map(msg => ({
    id: msg.id,
    senderId: msg.sender_id,
    recipientId: msg.recipient_id,
    text: msg.content,
    created_at: msg.created_at,
  }));
}

function isAdmin(client) {
  return client?.role === 'admin';
}

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
    role: 'user',
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

    current.lastActivity = Date.now();

    if (msg.type === 'auth') {
      try {
        const decoded = jwt.verify(msg.token, JWT_SECRET);

        const { data: dbUser } = await supabase
          .from('users')
          .select('banned_forever, role')
          .eq('id', decoded.userId)
          .single();

        if (!dbUser) {
          ws.close(4003, 'Invalid token');
          return;
        }

        if (dbUser.banned_forever) {
          ws.close(4006, 'У нас тут таких не любят');
          return;
        }

        current.userId = decoded.userId;
        current.nickname = decoded.nickname;
        current.role = dbUser.role;
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
        ws.send(JSON.stringify({
          type: 'auth_ok',
          data: {
            nickname: current.nickname,
            userId: current.userId,
            role: current.role,
            serverVersion: VERSION
          }
        }));
        ws.send(JSON.stringify({ type: 'history', data: messages }));
        broadcast({ type: 'players', data: getOnlinePlayers() });

        // Отправка входящих запросов
        const { data: pendingRequests } = await supabase
          .from('friend_requests')
          .select('id, sender_id, sender:nickname')
          .eq('receiver_id', current.userId)
          .eq('status', 'pending');
        if (pendingRequests) {
          ws.send(JSON.stringify({
            type: 'friend_requests_list',
            data: pendingRequests.map(r => ({
              requestId: r.id,
              senderId: r.sender_id,
              senderNickname: r.sender?.nickname || 'Unknown'
            }))
          }));
        }

        log('info', `Пользователь авторизован: ${current.nickname} (${current.role})`);
      } catch (err) {
        ws.close(4003, 'Invalid token');
      }
      return;
    }

    if (!current.userId) return;

    if (current.bannedUntil && current.bannedUntil > Date.now() &&
        msg.type !== 'private_message' &&
        msg.type !== 'private_typing' &&
        msg.type !== 'private_history') {
      sendTo(ws, { type: 'banned', data: { until: current.bannedUntil } });
      return;
    }

    try {
      switch (msg.type) {
        case 'message': {
          const { text, imageUrl } = msg.data;
          const message = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            nickname: current.nickname,
            userId: current.userId,
            text: text || '',
            imageUrl: imageUrl || null,
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
          const { recipientId, text, imageUrl } = msg.data;
          if (!recipientId || (!text && !imageUrl)) break;
          if (recipientId === current.userId) break;

          const recipientWs = [...clients.entries()].find(([, c]) => c.userId === recipientId)?.[0];

          const { data: savedMessage, error } = await supabase
            .from('private_messages')
            .insert([{ sender_id: current.userId, recipient_id: recipientId, content: text || '', image_url: imageUrl || null }])
            .select()
            .single();

          if (error) {
            log('error', 'Ошибка сохранения личного сообщения:', error.message);
            break;
          }

          const messageForClient = {
            id: savedMessage.id,
            senderId: current.userId,
            recipientId,
            text: savedMessage.content,
            imageUrl: savedMessage.image_url,
            created_at: savedMessage.created_at,
          };

          sendTo(ws, { type: 'private_message_sent', data: messageForClient });

          if (recipientWs) {
            sendTo(recipientWs, { type: 'private_message', data: messageForClient });
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
              data: { senderId: current.userId, senderNickname: current.nickname, isTyping },
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

          sendTo(ws, { type: 'duel_request_sent', data: { targetNick: target.nickname } });

          target.pendingInviteTimeout = setTimeout(() => {
            if (target.pendingInviteTimeout) {
              clearTimeout(target.pendingInviteTimeout);
              target.pendingInviteTimeout = null;
              sendTo(ws, { type: 'duel_timeout', data: { targetNick: target.nickname } });
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

        // ============== АДМИНСКИЕ ФУНКЦИИ ==============

        case 'ban_forever': {
          if (!isAdmin(current)) break;
          const { userId } = msg.data;
          if (!userId) break;

          const { error } = await supabase
            .from('users')
            .update({ banned_forever: true })
            .eq('id', userId);

          if (error) {
            log('error', 'Ошибка бана:', error.message);
            break;
          }

          const targetWs = [...clients.entries()].find(([, c]) => c.userId === userId)?.[0];
          if (targetWs) {
            sendTo(targetWs, { type: 'banned_forever', data: { reason: 'У нас тут таких не любят' } });
            targetWs.close(4006, 'У нас тут таких не любят');
          }

          broadcast({ type: 'players', data: getOnlinePlayers() });
          break;
        }

        case 'delete_message': {
          if (!isAdmin(current)) break;
          const { messageId } = msg.data;
          if (!messageId) break;

          const index = messages.findIndex(m => m.id === messageId);
          if (index !== -1) {
            messages.splice(index, 1);
            broadcast({ type: 'message_deleted', data: { messageId } });
          }
          break;
        }

        case 'watch_chat': {
          if (!isAdmin(current)) break;
          sendTo(ws, { type: 'admin_error', data: { message: 'Функция в разработке' } });
          break;
        }

        // ============== ДРУЗЬЯ ==============

        case 'friend_request': {
          const { receiverId } = msg.data;
          if (!receiverId || receiverId === current.userId) break;

          const { data: receiver, error: userError } = await supabase
            .from('users')
            .select('id, nickname')
            .eq('id', receiverId)
            .single();
          if (userError || !receiver) break;

          const { data: existing, error: existError } = await supabase
            .from('friend_requests')
            .select('id')
            .eq('sender_id', current.userId)
            .eq('receiver_id', receiverId)
            .eq('status', 'pending')
            .single();
          if (existing) break;

          const { data: request, error: insertError } = await supabase
            .from('friend_requests')
            .insert([{
              sender_id: current.userId,
              receiver_id: receiverId,
              status: 'pending'
            }])
            .select()
            .single();

          if (insertError) {
            log('error', 'Ошибка создания запроса:', insertError.message);
            break;
          }

          // Уведомление отправителю
          sendTo(ws, {
            type: 'friend_request_sent',
            data: { receiverId, receiverNickname: receiver.nickname }
          });

          // Уведомление получателю
          const receiverWs = [...clients.entries()].find(([, c]) => c.userId === receiverId)?.[0];
          if (receiverWs) {
            sendTo(receiverWs, {
              type: 'new_friend_request',
              data: {
                requestId: request.id,
                senderId: current.userId,
                senderNickname: current.nickname,
              }
            });
          }
          break;
        }

        case 'friend_request_accept': {
          const { requestId } = msg.data;
          if (!requestId) break;

          const { data: request, error: findError } = await supabase
            .from('friend_requests')
            .select('sender_id, receiver_id')
            .eq('id', requestId)
            .eq('receiver_id', current.userId)
            .eq('status', 'pending')
            .single();

          if (findError || !request) {
            log('error', 'Запрос не найден или уже обработан');
            break;
          }

          // Получаем ник отправителя
          const { data: senderUser } = await supabase
            .from('users')
            .select('nickname')
            .eq('id', request.sender_id)
            .single();
          const senderNick = senderUser?.nickname || 'Unknown';

          const { error: friendError } = await supabase
            .from('friends')
            .insert([
              { user_id: current.userId, friend_id: request.sender_id },
              { user_id: request.sender_id, friend_id: current.userId }
            ]);

          if (friendError) {
            log('error', 'Ошибка добавления друзей:', friendError.message);
            break;
          }

          await supabase
            .from('friend_requests')
            .update({ status: 'accepted' })
            .eq('id', requestId);

          // Уведомление обоим
          const senderWs = [...clients.entries()].find(([, c]) => c.userId === request.sender_id)?.[0];
          const notifyData = {
            type: 'friend_request_accepted_notification',
            data: {
              user1Id: request.sender_id,
              user1Nickname: senderNick,
              user2Id: current.userId,
              user2Nickname: current.nickname
            }
          };
          if (senderWs) sendTo(senderWs, notifyData);
          sendTo(ws, notifyData); // текущему

          // Отправить обновлённый список друзей обоим
          const sendFriendsList = async (userId, wsTo) => {
            const { data: friends } = await supabase
              .from('friends')
              .select('friend_id, users!inner(nickname)')
              .eq('user_id', userId);
            if (friends) {
              wsTo.send(JSON.stringify({
                type: 'friends_list',
                data: friends.map(f => ({
                  userId: f.friend_id,
                  nickname: f.users.nickname
                }))
              }));
            }
          };
          await sendFriendsList(current.userId, ws);
          if (senderWs) await sendFriendsList(request.sender_id, senderWs);
          break;
        }

        case 'friend_request_decline': {
          const { requestId } = msg.data;
          if (!requestId) break;

          const { data: request, error: findError } = await supabase
            .from('friend_requests')
            .select('sender_id, receiver_id')
            .eq('id', requestId)
            .eq('receiver_id', current.userId)
            .eq('status', 'pending')
            .single();

          if (findError || !request) break;

          await supabase
            .from('friend_requests')
            .update({ status: 'declined' })
            .eq('id', requestId);

          const senderWs = [...clients.entries()].find(([, c]) => c.userId === request.sender_id)?.[0];
          if (senderWs) {
            sendTo(senderWs, {
              type: 'friend_request_declined',
              data: { userId: current.userId, nickname: current.nickname }
            });
          }
          break;
        }

        case 'get_friends': {
          const { data: friends, error } = await supabase
            .from('friends')
            .select('friend_id, users!inner(nickname)')
            .eq('user_id', current.userId);
          if (!error && friends) {
            ws.send(JSON.stringify({
              type: 'friends_list',
              data: friends.map(f => ({
                userId: f.friend_id,
                nickname: f.users.nickname
              }))
            }));
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
    if (client.pendingInviteTimeout) clearTimeout(client.pendingInviteTimeout);
    clients.delete(ws);
    wsById.delete(client.id);
    broadcast({ type: 'players', data: getOnlinePlayers() });
    log('info', `Соединение закрыто: ${client.id}`);
  });
});

log('info', `Сервер запущен (HTTP + WebSocket) на порту ${PORT}`);