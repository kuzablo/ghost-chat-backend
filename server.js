if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const multer = require('multer');
const webpush = require('web-push');

// [2.28.1] Retry для upload в Supabase Storage — 3 попытки с backoff.
//          Класс багов: ECONNRESET между Amvera и Supabase, «fetch failed»
//          в StorageUnknownError. Транзиентные — лечим retry, логические
//          (конфликт, неверный bucket) — не retry'им.
// [2.28.0] Видео-сообщения (кружки): video_url, video_duration, video_mime
//          в messages и private_messages. Upload 100 МБ.
// [2.27.0] Избранные стикеры: favorite_stickers JSONB у users,
//          WS toggle_favorite_sticker, отдаём в auth_ok.
// [2.26.4] ver в client-error
// [2.26.3] CORS: явный origin + credentials
// [2.26.1] Параллелизация auth-flow
// [2.26.0] Глобальный фон чата
// [2.25.0] private_delete_message
// [2.24.0] Голосовые
// [2.23.4] dialogs: lastFromMe + lastIsRead
// [2.23.0] Стикеры
const VERSION = '2.28.7';
const PORT = process.env.PORT || 3000;
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_MESSAGES = 100;
const MAX_BIO_LENGTH = 200;
const MAX_ROTATION_DEG = 15;
const MAX_UPLOAD_MB = 25;
const MAX_AVATAR_MB = 25;
const MAX_STICKER_MB = 10;
const MAX_VOICE_MB = 20;
const MAX_VIDEO_MB = 100;
const MAX_DIALOGS_BG_MB = 15;
const MAX_DIALOGS_BG_LENGTH = 500;
const MAX_FAVORITE_STICKERS = 60;
const MAX_STORAGE_ITEMS = 500;

const IG_CACHE_TTL_MS = 60 * 60 * 1000;
const IG_FETCH_TIMEOUT_MS = 7000;
const IG_PROXY_URL = 'https://instagram-embed-proxy.kuzablo422.workers.dev';
const API_PUBLIC_URL = 'https://api.banjoboy420.ru';

const FRIEND_CD_MS_1 = 5 * 60 * 1000;
const FRIEND_CD_MS_2 = 60 * 60 * 1000;
const FRIEND_CD_MS_3 = 24 * 60 * 60 * 1000;

function calcFriendCooldownMs(count) {
  if (count >= 3) return FRIEND_CD_MS_3;
  if (count === 2) return FRIEND_CD_MS_2;
  return FRIEND_CD_MS_1;
}

function formatCooldownLeft(msLeft) {
  const mins = Math.ceil(msLeft / 60000);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.ceil(mins / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.ceil(hours / 24);
  return `${days} дн`;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// [2.28.4] Единый клиент через service_role — он обходит RLS.
// Раньше часть запросов шла через anon-ключ. После включения RLS
// на users/private_messages/friends/blocks они бы упали. Теперь
// весь бэк работает под service_role, RLS включён на всех таблицах.
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || supabaseKey);
const supabase = supabaseAdmin;

const JWT_SECRET = process.env.JWT_SECRET;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@banjoboy420.ru';
const pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[PUSH] VAPID-ключи не заданы — Web Push отключён');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'));
    }
    cb(null, true);
  },
});

const uploadSticker = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_STICKER_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || file.mimetype !== 'image/gif') {
      return cb(new Error('Only GIF allowed'));
    }
    cb(null, true);
  },
});

const uploadDialogsBg = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DIALOGS_BG_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'));
    }
    cb(null, true);
  },
});

const uploadVoice = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VOICE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('audio/')) {
      return cb(new Error('Only audio allowed'));
    }
    cb(null, true);
  },
});

const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('video/')) {
      return cb(new Error('Only video allowed'));
    }
    cb(null, true);
  },
});

const app = express();
const path = require('path');
const distPath = path.join(__dirname, 'frontend', 'dist');

const ALLOWED_ORIGINS = [
  'https://banjoboy420.ru',
  'https://www.banjoboy420.ru',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));

app.use(express.json());

const clientErrorBuckets = new Map();
const CLIENT_ERROR_WINDOW_MS = 60 * 1000;
const CLIENT_ERROR_MAX = 30;

// [2.28.5] Rate limit на login/register — защита от брута и спама
// регистрациями. 10 попыток за 15 минут на IP.
const authBuckets = new Map();
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 10;

function checkAuthRate(ip) {
  const now = Date.now();
  const stamps = (authBuckets.get(ip) || [])
    .filter(t => now - t < AUTH_WINDOW_MS);
  if (stamps.length >= AUTH_MAX_ATTEMPTS) return false;
  stamps.push(now);
  authBuckets.set(ip, stamps);
  return true;
}

function checkClientErrorRate(ip) {
  const now = Date.now();
  const stamps = (clientErrorBuckets.get(ip) || [])
    .filter(t => now - t < CLIENT_ERROR_WINDOW_MS);
  if (stamps.length >= CLIENT_ERROR_MAX) return false;
  stamps.push(now);
  clientErrorBuckets.set(ip, stamps);
  return true;
}

app.post('/api/client-error', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();

  if (!checkClientErrorRate(ip)) {
    return res.status(429).json({ ok: false });
  }

  const {
    stage = 'unknown',
    message = '',
    stack = '',
    url = '',
    ua = '',
    ver = 'unknown',
    ts = Date.now(),
  } = req.body || {};

  const safeMessage = String(message).slice(0, 500);
  const safeStack = String(stack).slice(0, 1500);
  const safeUrl = String(url).slice(0, 300);
  const safeUa = String(ua).slice(0, 300);
  const safeStage = String(stage).slice(0, 60);

  log(
    'warn',
    `[CLIENT-ERROR] stage=${safeStage} ver=${ver} ip=${ip} ts=${ts}\n` +
    `  msg=${safeMessage}\n` +
    `  url=${safeUrl}\n` +
    `  ua=${safeUa}\n` +
    `  stack=${safeStack}`
  );

  res.json({ ok: true });
});

const log = (level, ...args) => {
  console[level](`[CHAT v${VERSION}]`, ...args);
};

// ===== [2.28.1] RETRY UPLOAD =====
// Обёртка вокруг supabaseAdmin.storage.from(bucket).upload(...) с retry.
// Retry только на транзиентные сетевые ошибки. Логические (конфликт,
// неверный bucket) — сразу наружу.
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_BACKOFF_BASE_MS = 500;

function isTransientUploadError(error) {
  if (!error) return false;
  const name = error.name || '';
  const msg = String(error.message || error.error || error);
  const cause = error.originalError?.message || error.cause?.message || '';

  if (name === 'StorageUnknownError') return true;
  if (error.originalError?.name === 'TypeError') return true;

  const haystack = `${msg} ${cause}`;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|aborted|timeout/i
    .test(haystack);
}

async function uploadWithRetry(bucket, path, buffer, options = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, buffer, options);

    if (!error) {
      if (attempt > 1) {
        log('info', `[UPLOAD] ${bucket}/${path} — успех с попытки ${attempt}`);
      }
      return { data, error: null };
    }

    lastError = error;
    const transient = isTransientUploadError(error);

    if (!transient || attempt === UPLOAD_MAX_ATTEMPTS) {
      log(
        'warn',
        `[UPLOAD] ${bucket}/${path} — сдаёмся на попытке ${attempt}/${UPLOAD_MAX_ATTEMPTS}. ` +
        `transient=${transient} msg=${error.message || error}`
      );
      return { data: null, error };
    }

    const delay = UPLOAD_BACKOFF_BASE_MS * attempt;
    log(
      'warn',
      `[UPLOAD] ${bucket}/${path} — попытка ${attempt}/${UPLOAD_MAX_ATTEMPTS} упала: ` +
      `${error.message || error}. Повтор через ${delay}мс`
    );

    await new Promise(r => setTimeout(r, delay));
  }

  return { data: null, error: lastError };
}
// ===== /RETRY UPLOAD =====

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
    const { error } = await uploadWithRetry('chat-images', filePath, file.buffer, {
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

// ===== ЗАГРУЗКА АВАТАРА =====
app.post('/api/upload-avatar', uploadAvatar.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const file = req.file;
  const fileExt = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `${decoded.userId}_${Date.now()}.${fileExt}`;
  const filePath = `avatars/${fileName}`;

  try {
    const { error } = await uploadWithRetry('chat-images', filePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      console.error('❌ Avatar upload error:', error);
      throw error;
    }

    const { data: urlData } = await supabaseAdmin.storage
      .from('chat-images')
      .getPublicUrl(filePath);
    const publicURL = urlData?.publicUrl;

    if (!publicURL) {
      throw new Error('Public URL not generated');
    }

    console.log(`[PROFILE] avatar uploaded for ${decoded.nickname}`);
    res.json({ avatarUrl: publicURL });
  } catch (err) {
    console.error('Ошибка загрузки аватара:', err);
    res.status(500).json({ error: err.message || 'Avatar upload failed' });
  }
});

// ===== ЗАГРУЗКА СТИКЕРА (admin only) =====
app.post('/api/upload-sticker', uploadSticker.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', decoded.userId)
    .single();

  if (!dbUser || dbUser.role !== 'admin') {
    log('warn', `[STICKER] попытка загрузки не-админом: ${decoded.nickname}`);
    return res.status(403).json({ error: 'Admin only' });
  }

  const file = req.file;
  const fileName = `sticker_${Date.now()}_${Math.random().toString(36).slice(2)}.gif`;
  const filePath = `stickers/${fileName}`;

  try {
    const { error: uploadErr } = await uploadWithRetry('chat-images', filePath, file.buffer, {
      contentType: 'image/gif',
      cacheControl: '31536000',
      upsert: false,
    });

    if (uploadErr) {
      console.error('❌ Sticker upload error:', uploadErr);
      throw uploadErr;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('chat-images')
      .getPublicUrl(filePath);
    const publicURL = urlData?.publicUrl;

    if (!publicURL) {
      throw new Error('Public URL not generated');
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('stickers')
      .insert([{ url: publicURL }])
      .select()
      .single();

    if (insertErr) {
      console.error('❌ Sticker insert error:', insertErr);
      throw insertErr;
    }

    const allStickers = await getStickers(true);

    broadcast({
      type: 'stickers_list',
      data: { stickers: allStickers },
    });

    log('info', `[STICKER] ${decoded.nickname} загрузил стикер (${allStickers.length} всего)`);
    res.json({ sticker: inserted, stickers: allStickers });
  } catch (err) {
    console.error('Ошибка загрузки стикера:', err);
    res.status(500).json({ error: err.message || 'Sticker upload failed' });
  }
});

// ===== ЗАГРУЗКА ФОНА ДИАЛОГОВ =====
app.post('/api/upload-dialogs-bg', uploadDialogsBg.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const file = req.file;
  const fileExt = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `${decoded.userId}_${Date.now()}.${fileExt}`;
  const filePath = `dialogs-bg/${fileName}`;

  try {
    const { error } = await uploadWithRetry('chat-images', filePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      console.error('❌ Dialogs bg upload error:', error);
      throw error;
    }

    const { data: urlData } = await supabaseAdmin.storage
      .from('chat-images')
      .getPublicUrl(filePath);
    const publicURL = urlData?.publicUrl;

    if (!publicURL) {
      throw new Error('Public URL not generated');
    }

    console.log(`[DIALOGS-BG] uploaded for ${decoded.nickname}`);
    res.json({ bgUrl: publicURL });
  } catch (err) {
    console.error('Ошибка загрузки фона диалогов:', err);
    res.status(500).json({ error: err.message || 'Dialogs bg upload failed' });
  }
});

// ===== ЗАГРУЗКА ГОЛОСОВОГО =====
app.post('/api/upload-voice', uploadVoice.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const file = req.file;
  const fileExt = (file.originalname.split('.').pop() || 'webm').toLowerCase();
  const fileName = `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `voice/${fileName}`;

  try {
    const { error } = await uploadWithRetry('chat-images', filePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000',
      upsert: false,
    });

    if (error) throw error;

    const { data: urlData } = supabaseAdmin.storage
      .from('chat-images')
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) throw new Error('Public URL not generated');

    res.json({ voiceUrl: urlData.publicUrl });
  } catch (err) {
    console.error('Ошибка загрузки голосового:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ===== ЗАГРУЗКА ВИДЕО (кружки) =====
app.post('/api/upload-video', uploadVideo.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const file = req.file;
  const fileExt = (file.originalname.split('.').pop() || 'webm').toLowerCase();
  const fileName = `video_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `video/${fileName}`;

  try {
    const { error } = await uploadWithRetry('chat-images', filePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000',
      upsert: false,
    });

    if (error) throw error;

    const { data: urlData } = supabaseAdmin.storage
      .from('chat-images')
      .getPublicUrl(filePath);

    if (!urlData?.publicUrl) throw new Error('Public URL not generated');

    log('info', `[VIDEO] uploaded ${fileName} (${(file.size / 1024 / 1024).toFixed(1)} МБ)`);
    res.json({ videoUrl: urlData.publicUrl });
  } catch (err) {
    console.error('Ошибка загрузки видео:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// ===== INSTAGRAM OEMBED =====
const igCache = new Map();

function isValidInstagramUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'instagram.com' && host !== 'instagr.am') return false;
    return /^\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

function b64urlEncode(s) {
  return Buffer.from(s, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const pad = 4 - (s.length % 4);
  const padded = s + (pad < 4 ? '='.repeat(pad) : '');
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function isValidInstagramThumbUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === 'scontent.cdninstagram.com' ||
      host.endsWith('.cdninstagram.com') ||
      host.endsWith('.fbcdn.net')
    );
  } catch {
    return false;
  }
}

app.get('/api/instagram-embed', async (req, res) => {
  const url = String(req.query.url || '').trim();

  if (!isValidInstagramUrl(url)) {
    return res.status(400).json({ error: 'Invalid Instagram URL' });
  }

  const cached = igCache.get(url);
  if (cached && cached.expires > Date.now()) {
    return res.json(cached.data);
  }

  const encoded = encodeURIComponent(url);
  const endpoints = [
    `${IG_PROXY_URL}/?url=${encodeURIComponent(`https://www.instagram.com/api/v1/oembed/?url=${encoded}`)}`,
    `${IG_PROXY_URL}/?url=${encodeURIComponent(`https://api.instagram.com/oembed/?url=${encoded}`)}`,
  ];

  const fetchOne = async (endpoint) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), IG_FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(endpoint, { signal: ctrl.signal });

      if (!resp.ok) {
        const preview = await resp.text().catch(() => '');
        log('warn', `[IG] ${endpoint} → HTTP ${resp.status}, body: ${preview.slice(0, 200)}`);
        return null;
      }

      const data = await resp.json();
      if (!data || !data.thumbnail_url) {
        log('warn', `[IG] ${endpoint} → ok, но нет thumbnail_url`);
        return null;
      }

      const isVideo =
        /\/(reel|reels|tv)\//.test(url) ||
        data.type === 'video' ||
        data.media_type === 'video';

      return {
        thumbnailUrl: `${API_PUBLIC_URL}/api/instagram-thumb?u=${b64urlEncode(data.thumbnail_url)}`,
        title: data.title || null,
        authorName: data.author_name || null,
        isVideo,
        url,
      };
    } catch (err) {
      const cause = err.cause
        ? `${err.cause.code || err.cause.name || ''} ${err.cause.message || ''}`.trim()
        : 'no-cause';
      log('warn', `[IG] ${endpoint} → ${err.name}: ${err.message} | cause: ${cause}`);
      return null;
    } finally {
      clearTimeout(t);
    }
  };

  const results = await Promise.allSettled(endpoints.map(fetchOne));
  const payload = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)[0];

  if (!payload) {
    log('warn', `[IG] все endpoint упали для ${url}`);
    return res.status(502).json({ error: 'Instagram oEmbed unavailable' });
  }

  igCache.set(url, { data: payload, expires: Date.now() + IG_CACHE_TTL_MS });
  log('info', `[IG] oEmbed ok for ${url}`);
  return res.json(payload);
});

app.get('/api/instagram-thumb', async (req, res) => {
  let url = '';
  try {
    url = b64urlDecode(String(req.query.u || '').trim());
  } catch {
    return res.status(400).json({ error: 'Invalid encoding' });
  }

  if (!isValidInstagramThumbUrl(url)) {
    return res.status(400).json({ error: 'Invalid thumbnail URL' });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), IG_FETCH_TIMEOUT_MS);

  try {
    const workerUrl = `${IG_PROXY_URL}/?url=${encodeURIComponent(url)}`;
    const resp = await fetch(workerUrl, { signal: ctrl.signal });
    clearTimeout(t);

    if (!resp.ok) {
      log('warn', `[IG-THUMB] upstream HTTP ${resp.status} for ${url.slice(0, 80)}`);
      return res.status(resp.status).end();
    }

    const ct = resp.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await resp.arrayBuffer());

    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(buf);
  } catch (err) {
    clearTimeout(t);
    log('warn', `[IG-THUMB] error: ${err.message}`);
    res.status(502).end();
  }
});

// ===== РЕГИСТРАЦИЯ =====
app.post('/api/register', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
  if (!checkAuthRate(ip)) {
    return res.status(429).json({ error: 'Слишком много попыток. Подожди 15 минут.' });
  }

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
    .insert([{
      nickname,
      password_hash,
      role: 'user',
      banned_forever: false,
      friend_request_cooldowns: {},
      favorite_stickers: [],
    }])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const token = jwt.sign(
    { userId: user.id, nickname: user.nickname, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, nickname: user.nickname, role: user.role });
});

// ===== ВХОД =====
app.post('/api/login', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString().split(',')[0].trim();
  if (!checkAuthRate(ip)) {
    return res.status(429).json({ error: 'Слишком много попыток. Подожди 15 минут.' });
  }

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
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, nickname: user.nickname, role: user.role });
});

// ===== PUSH ПОДПИСКИ =====
app.post('/api/push/subscribe', async (req, res) => {
  const { token, subscription } = req.body || {};
  if (!token || !subscription?.endpoint || !subscription?.keys) {
    return res.status(400).json({ error: 'token and subscription required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { endpoint, keys } = subscription;

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert(
      [{ user_id: decoded.userId, endpoint, keys }],
      { onConflict: 'endpoint' }
    );

  if (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({ error: error.message });
  }

  console.log(`[PUSH] subscribed: ${decoded.nickname} (${endpoint.slice(0, 40)}…)`);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', async (req, res) => {
  const { token, endpoint } = req.body || {};
  if (!token || !endpoint) {
    return res.status(400).json({ error: 'token and endpoint required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', decoded.userId)
    .eq('endpoint', endpoint);

  res.json({ ok: true });
});

// [2.28.3] Раздача собранного фронта из frontend/dist.
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`[CHAT v${VERSION}] HTTP server listening on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

let clientIdCounter = 0;
const clients = new Map();
const wsById = new Map();

const RATE_LIMIT_WINDOW_MS = 10 * 1000;
const RATE_LIMIT_MAX = 5;
const MAX_TEXT_LENGTH = 2000;
const rateBuckets = new Map();

function checkRate(userId) {
  const now = Date.now();
  const stamps = (rateBuckets.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (stamps.length >= RATE_LIMIT_MAX) return false;
  stamps.push(now);
  rateBuckets.set(userId, stamps);
  return true;
}

function sendTo(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload, exceptWs = null) {
  wss.clients.forEach(ws => {
    if (ws !== exceptWs) sendTo(ws, payload);
  });
}

async function getBannedUserIds() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('banned_forever', true);
  if (error) {
    log('error', 'Ошибка загрузки забаненных:', error.message);
    return [];
  }
  return (data || []).map(u => u.id);
}

async function getAvatarsMap() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, avatar_url')
    .not('avatar_url', 'is', null);
  if (error) {
    log('error', 'Ошибка загрузки карты аватарок:', error.message);
    return [];
  }
  return (data || []).map(u => ({
    userId: u.id,
    avatarUrl: u.avatar_url,
  }));
}

// ===== СТИКЕРЫ =====
let cachedStickers = null;

async function getStickers(force = false) {
  if (!force && cachedStickers) return cachedStickers;

  const { data, error } = await supabaseAdmin
    .from('stickers')
    .select('id, url, order_index, created_at')
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    log('error', 'Ошибка загрузки стикеров:', error.message);
    return [];
  }

  cachedStickers = data || [];
  return cachedStickers;
}

async function isValidStickerUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const list = await getStickers();
  return list.some(s => s.url === url);
}

async function getBlockedByMe(blockerId) {
  const { data: rows, error } = await supabaseAdmin
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', blockerId);
  if (error || !rows || rows.length === 0) return [];

  const ids = rows.map(r => r.blocked_id);
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, nickname, avatar_url')
    .in('id', ids);

  const order = new Map(ids.map((id, i) => [id, i]));
  return (users || [])
    .map(u => ({
      userId: u.id,
      nickname: u.nickname,
      avatarUrl: u.avatar_url || null,
    }))
    .sort((a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0));
}

async function getAllBlocksMap() {
  const { data, error } = await supabaseAdmin
    .from('blocks')
    .select('blocker_id, blocked_id');
  if (error) {
    log('error', 'Ошибка загрузки блокировок:', error.message);
    return new Map();
  }
  const map = new Map();
  (data || []).forEach(b => {
    if (!map.has(b.blocker_id)) map.set(b.blocker_id, new Set());
    map.get(b.blocker_id).add(b.blocked_id);
  });
  return map;
}

async function isBlockedEitherWay(a, b) {
  const { data } = await supabaseAdmin
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  return !!(data && data.length > 0);
}

function getOnlinePlayers() {
  const now = Date.now();
  return [...clients.values()]
    .filter(c => (!c.bannedUntil || c.bannedUntil < now) && c.nickname !== 'Аноним')
    .map(c => ({
      id: c.id,
      userId: c.userId,
      nickname: c.nickname,
      role: c.role,
      wins: c.wins,
      losses: c.losses,
      avatarUrl: c.avatarUrl || null,
    }));
}

async function broadcastPlayers() {
  const all = getOnlinePlayers();
  const blocksMap = await getAllBlocksMap();

  for (const [ws, client] of clients.entries()) {
    if (!client.userId) continue;
    const blocked = blocksMap.get(client.userId);
    const filtered = (blocked && blocked.size > 0)
      ? all.filter(p => !blocked.has(p.userId) || p.userId === client.userId)
      : all;
    sendTo(ws, { type: 'players', data: filtered });
  }
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

const mapMessageRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  nickname: row.nickname,
  text: row.text || '',
  imageUrl: row.image_url || null,
  stickerUrl: row.sticker_url || null,
  voiceUrl: row.voice_url || null,
  voiceDuration: row.voice_duration != null ? Number(row.voice_duration) : null,
  voiceWaveform: row.voice_waveform || null,
  videoUrl: row.video_url || null,
  videoDuration: row.video_duration != null ? Number(row.video_duration) : null,
  videoMime: row.video_mime || null,
  isCircle: row.is_circle === true,
  time: Number(row.time),
  reactions: row.reactions || {},
  replyTo: row.reply_to || null,
  forwardedFrom: row.forwarded_from || null,
});

async function loadHistory(limit = MAX_MESSAGES) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .order('time', { ascending: false })
    .limit(limit);

  if (error) {
    log('error', 'Ошибка загрузки истории:', error.message);
    return [];
  }
  return (data || []).reverse().map(mapMessageRow);
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
    imageUrl: msg.image_url || null,
    stickerUrl: msg.sticker_url || null,
    created_at: msg.created_at,
    is_read: msg.is_read || false,
    reactions: msg.reactions || {},
    forwardedFrom: msg.forwarded_from || null,
    voiceUrl: msg.voice_url || null,
    voiceDuration: msg.voice_duration != null ? Number(msg.voice_duration) : null,
    voiceWaveform: msg.voice_waveform || null,
    videoUrl: msg.video_url || null,
    videoDuration: msg.video_duration != null ? Number(msg.video_duration) : null,
    videoMime: msg.video_mime || null,
    isCircle: msg.is_circle === true,
  }));
}

async function getDialogs(userId) {
  const { data: rows, error } = await supabaseAdmin
    .from('private_messages')
    .select('sender_id, recipient_id, content, image_url, sticker_url, voice_url, video_url, created_at, is_read')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    log('error', 'Ошибка загрузки диалогов:', error.message);
    return [];
  }

  const map = {};
  (rows || []).forEach(row => {
    const otherId = row.sender_id === userId ? row.recipient_id : row.sender_id;
    if (!map[otherId]) {
      map[otherId] = {
        userId: otherId,
        lastText: row.content
          || (row.sticker_url ? '🎨 стикер' : '')
          || (row.image_url ? '📷 фото' : '')
          || (row.voice_url ? '🎤 голосовое' : '')
          || (row.video_url ? '📹 видео' : ''),
        lastAt: row.created_at,
        unread: 0,
        lastFromMe: row.sender_id === userId,
        lastIsRead: row.is_read === true,
      };
    }
    if (row.recipient_id === userId && row.is_read === false) {
      map[otherId].unread += 1;
    }
  });

  const otherIds = Object.keys(map);
  if (otherIds.length === 0) return [];

  const { data: users, error: usersErr } = await supabaseAdmin
    .from('users')
    .select('id, nickname, avatar_url')
    .in('id', otherIds);

  if (usersErr) {
    log('error', 'Ошибка загрузки ников диалогов:', usersErr.message);
    return [];
  }

  const userMap = {};
  (users || []).forEach(u => {
    userMap[u.id] = { nickname: u.nickname, avatarUrl: u.avatar_url || null };
  });

  return Object.values(map)
    .filter(d => userMap[d.userId])
    .map(d => ({
      ...d,
      nickname: userMap[d.userId].nickname,
      avatarUrl: userMap[d.userId].avatarUrl,
    }))
    .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

let cachedAdmin = null;
async function getAdmin() {
  if (cachedAdmin) return cachedAdmin;
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, nickname')
    .eq('role', 'admin')
    .limit(1)
    .single();
  if (error || !data) return null;
  cachedAdmin = { userId: data.id, nickname: data.nickname };
  return cachedAdmin;
}

function isAdmin(client) {
  return client?.role === 'admin';
}

async function sendPushToUser(userId, payload) {
  if (!pushEnabled) return;

  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .eq('user_id', userId);

  if (error || !subs || subs.length === 0) return;

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload)
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id);
      } else {
        log('warn', 'Push send error:', err.statusCode, err.message);
      }
    }
  }));
}

async function pushBroadcast(senderUserId, payload) {
  if (!pushEnabled) return;

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('user_id')
    .neq('user_id', senderUserId);

  if (!subs || subs.length === 0) return;

  const onlineUserIds = new Set(
    [...clients.values()].filter(c => c.userId).map(c => c.userId)
  );

  const targets = [...new Set(subs.map(s => s.user_id))]
    .filter(uid => !onlineUserIds.has(uid));

  await Promise.all(targets.map(uid => sendPushToUser(uid, payload)));
}

async function pushToUser(recipientId, payload) {
  if (!pushEnabled) return;

  const isOnline = [...clients.values()].some(c => c.userId === recipientId);
  if (isOnline) return;

  await sendPushToUser(recipientId, payload);
}

async function buildProfile(userId, currentUserId) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, nickname, role, bio, avatar_url, wins, losses, font, text_color, text_rotation')
    .eq('id', userId)
    .single();

  if (error || !user) return null;

  let isFriend = false;
  if (userId !== currentUserId) {
    const { data: rel } = await supabaseAdmin
      .from('friends')
      .select('user_id')
      .eq('user_id', currentUserId)
      .eq('friend_id', userId)
      .maybeSingle();
    isFriend = !!rel;
  }

  return {
    userId: user.id,
    nickname: user.nickname,
    role: user.role,
    bio: user.bio || '',
    avatarUrl: user.avatar_url || null,
    wins: user.wins || 0,
    losses: user.losses || 0,
    font: user.font || 'default',
    textColor: user.text_color || '#111111',
    textRotation: user.text_rotation || 0,
    isSelf: user.id === currentUserId,
    isFriend,
  };
}

async function loadStorage(userId) {
  const { data, error } = await supabaseAdmin
    .from('storage_items')
    .select('id, type, payload, source, saved_at, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) {
    log('error', 'Ошибка загрузки хранилища:', error.message);
    return [];
  }
  return (data || []).map(r => ({
    id: r.id,
    type: r.type,
    payload: r.payload,
    source: r.source,
    savedAt: r.saved_at,
    sortOrder: r.sort_order,
  }));
}


async function getFriendsList(userId) {
  const { data: friendIds } = await supabaseAdmin
    .from('friends')
    .select('friend_id')
    .eq('user_id', userId);

  if (!friendIds || friendIds.length === 0) return [];

  const ids = friendIds.map(f => f.friend_id);
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, nickname, avatar_url')
    .in('id', ids);

  return (users || []).map(u => ({
    userId: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatar_url || null,
  }));
}

async function getAppSetting(key) {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    log('error', `[SETTINGS] read ${key}:`, error.message);
    return null;
  }
  return data?.value || null;
}

async function setAppSetting(key, value) {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert([{ key, value }], { onConflict: 'key' });
  if (error) {
    log('error', `[SETTINGS] write ${key}:`, error.message);
    return false;
  }
  return true;
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
    avatarUrl: null,
    dialogsBg: null,
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

        const [
          dbUserResult,
          admin,
          globalDialogsBg,
          bannedUserIds,
          avatars,
          stickers,
          blockedByMe,
          history,
          dialogs,
        ] = await Promise.all([
          supabase
            .from('users')
            .select('banned_forever, role, wins, losses, avatar_url, dialogs_bg, favorite_stickers')
            .eq('id', decoded.userId)
            .single(),
          getAdmin(),
          getAppSetting('global_dialogs_bg'),
          getBannedUserIds(),
          getAvatarsMap(),
          getStickers(),
          getBlockedByMe(decoded.userId),
          loadHistory(),
          getDialogs(decoded.userId),
        ]);

        const dbUser = dbUserResult?.data;

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
        current.wins = dbUser.wins || 0;
        current.losses = dbUser.losses || 0;
        current.avatarUrl = dbUser.avatar_url || null;
        current.dialogsBg = dbUser.dialogs_bg || null;
        current.lastActivity = Date.now();

        const favoriteStickers = Array.isArray(dbUser.favorite_stickers)
          ? dbUser.favorite_stickers
          : [];

        const duplicateEntries = [...clients.entries()].filter(([sock, c]) => {
          return sock !== ws && c.userId === current.userId;
        });
        for (const [oldSock, oldClient] of duplicateEntries) {
          log('info', `Замена старого соединения ${oldClient.id} на ${current.id}`);
          try { oldSock.close(4000, 'Replaced by new connection'); } catch { /* noop */ }
          clients.delete(oldSock);
          wsById.delete(oldClient.id);
        }

        clearTimeout(authTimeout);

        ws.send(JSON.stringify({ type: 'version', data: VERSION }));

        ws.send(JSON.stringify({
          type: 'auth_ok',
          data: {
            nickname: current.nickname,
            userId: current.userId,
            role: current.role,
            serverVersion: VERSION,
            adminUserId: admin?.userId || null,
            adminNickname: admin?.nickname || null,
            dialogsBg: current.dialogsBg,
            globalDialogsBg,
            favoriteStickers,
          }
        }));

        ws.send(JSON.stringify({
          type: 'banned_users_update',
          data: { bannedUserIds },
        }));

        ws.send(JSON.stringify({
          type: 'avatars_map',
          data: { avatars },
        }));

        ws.send(JSON.stringify({
          type: 'stickers_list',
          data: { stickers },
        }));

        ws.send(JSON.stringify({
          type: 'blocks_list',
          data: { blocked: blockedByMe },
        }));

        ws.send(JSON.stringify({ type: 'history', data: history }));

        const storage = await loadStorage(current.userId);
        ws.send(JSON.stringify({ type: 'storage_list', data: storage }));

        ws.send(JSON.stringify({ type: 'dialogs_list', data: dialogs }));

        await broadcastPlayers();

        const { data: pendingRequests } = await supabase
          .from('friend_requests')
          .select('id, sender_id')
          .eq('receiver_id', current.userId)
          .eq('status', 'pending');

        if (pendingRequests && pendingRequests.length > 0) {
          const senderIds = pendingRequests.map(r => r.sender_id);

          const { data: myFriends } = await supabaseAdmin
            .from('friends')
            .select('friend_id')
            .eq('user_id', current.userId)
            .in('friend_id', senderIds);

          const friendSet = new Set((myFriends || []).map(f => f.friend_id));

          const staleIds = pendingRequests
            .filter(r => friendSet.has(r.sender_id))
            .map(r => r.id);

          if (staleIds.length > 0) {
            await supabase
              .from('friend_requests')
              .delete()
              .in('id', staleIds);
          }

          const fresh = pendingRequests.filter(r => !friendSet.has(r.sender_id));

          if (fresh.length > 0) {
            const freshSenderIds = fresh.map(r => r.sender_id);
            const { data: senders } = await supabaseAdmin
              .from('users')
              .select('id, nickname')
              .in('id', freshSenderIds);

            const nickMap = {};
            (senders || []).forEach(u => { nickMap[u.id] = u.nickname; });

            ws.send(JSON.stringify({
              type: 'friend_requests_list',
              data: fresh.map(r => ({
                requestId: r.id,
                senderId: r.sender_id,
                senderNickname: nickMap[r.sender_id] || 'Unknown',
              }))
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'friend_requests_list',
              data: [],
            }));
          }
        }

        log('info', `Пользователь авторизован: ${current.nickname} (${current.role})`);
      } catch (err) {
        // [2.28.5] 300мс задержки при неверном токене — перебор
        // невалидных токенов замедляется в тысячи раз. Легитимный
        // юзер с истёкшим токеном не заметит.
        setTimeout(() => {
          try { ws.close(4003, 'Invalid token'); } catch { /* noop */ }
        }, 300);
      }
      return;
    }

    if (!current.userId) return;

    if (current.bannedUntil && current.bannedUntil > Date.now() &&
        msg.type !== 'private_message' &&
        msg.type !== 'private_typing' &&
        msg.type !== 'private_history' &&
        msg.type !== 'profile_get' &&
        msg.type !== 'block_user' &&
        msg.type !== 'unblock_user' &&
        msg.type !== 'dialogs_bg_update' &&
        msg.type !== 'toggle_favorite_sticker') {
      sendTo(ws, { type: 'banned', data: { until: current.bannedUntil } });
      return;
    }

    try {
      switch (msg.type) {
        // ===== ОСНОВНОЙ ЧАТ =====
        case 'message': {
          const { text, imageUrl, stickerUrl, replyTo, forwardedFrom, voiceUrl, voiceDuration, voiceWaveform, videoUrl, videoDuration, videoMime, isCircle } = msg.data;

          if (!checkRate(current.userId)) {
            sendTo(ws, { type: 'admin_error', data: { message: 'Слишком часто. Подожди пару секунд.' } });
            break;
          }

          if (stickerUrl && !(await isValidStickerUrl(stickerUrl))) {
            log('warn', `[STICKER] попытка использовать несуществующий стикер: ${current.nickname}`);
            break;
          }

          let safeText = text || '';
          if (safeText.length > MAX_TEXT_LENGTH) {
            safeText = safeText.slice(0, MAX_TEXT_LENGTH);
          }

          let safeForwardedFrom = null;
          if (forwardedFrom && typeof forwardedFrom === 'object') {
            const fn = typeof forwardedFrom.nickname === 'string'
              ? forwardedFrom.nickname.slice(0, 60) : null;
            if (fn) {
              safeForwardedFrom = {
                nickname: fn,
                originalId: typeof forwardedFrom.originalId === 'string'
                  ? forwardedFrom.originalId.slice(0, 100) : null,
                originalTime: Number.isFinite(forwardedFrom.originalTime)
                  ? Number(forwardedFrom.originalTime) : null,
                fromPrivate: !!forwardedFrom.fromPrivate,
              };
            }
          }

          let safeVoiceUrl = null;
          let safeVoiceDuration = null;
          let safeVoiceWaveform = null;
          if (typeof voiceUrl === 'string' && voiceUrl.length > 0) {
            safeVoiceUrl = voiceUrl.slice(0, 500);
            safeVoiceDuration = Number.isFinite(voiceDuration)
              ? Math.min(60, Math.max(0, Number(voiceDuration)))
              : 0;
            if (Array.isArray(voiceWaveform) && voiceWaveform.length > 0 && voiceWaveform.length <= 100) {
              safeVoiceWaveform = voiceWaveform.map(v =>
                Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
              );
            } else {
              safeVoiceWaveform = Array(40).fill(0.3);
            }
          }

          let safeVideoUrl = null;
          let safeVideoDuration = null;
          let safeVideoMime = null;
          if (typeof videoUrl === 'string' && videoUrl.length > 0) {
            safeVideoUrl = videoUrl.slice(0, 500);
            safeVideoDuration = Number.isFinite(videoDuration)
              ? Math.min(60, Math.max(0, Number(videoDuration)))
              : 0;
            if (typeof videoMime === 'string' && videoMime.length > 0 && videoMime.length <= 60) {
              safeVideoMime = videoMime;
            }
          }

          const row = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            user_id: current.userId,
            nickname: current.nickname,
            text: safeText,
            image_url: imageUrl || null,
            sticker_url: stickerUrl || null,
            time: Date.now(),
            reactions: {},
            reply_to: replyTo || null,
            forwarded_from: safeForwardedFrom,
            voice_url: safeVoiceUrl,
            voice_duration: safeVoiceDuration,
            voice_waveform: safeVoiceWaveform,
            video_url: safeVideoUrl,
            video_duration: safeVideoDuration,
            video_mime: safeVideoMime,
            is_circle: safeVideoUrl ? isCircle === true : false,
          };

          const { error } = await supabaseAdmin.from('messages').insert([row]);
          if (error) {
            log('error', 'Ошибка сохранения сообщения:', error.message);
            break;
          }
          broadcast({ type: 'message', data: mapMessageRow(row) });

          if (!stickerUrl) {
            pushBroadcast(current.userId, {
              title: current.nickname,
              body: safeText
                ? safeText.slice(0, 120)
                : (imageUrl ? '📷 фото'
                  : voiceUrl ? '🎤 голосовое'
                  : videoUrl ? '📹 видео'
                  : stickerUrl ? '🎨 стикер' : ''),
              url: '/',
              tag: `msg-${row.id}`,
            }).catch(err => log('warn', 'pushBroadcast error:', err.message));
          }

          break;
        }

        case 'client_log': {
          const text = msg.data?.text || '';
          log('info', `[CLIENT] ${text}`);
          break;
        }

        case 'ping': {
          sendTo(ws, { type: 'pong', data: msg.data });
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

          const { data: existing, error: fetchError } = await supabaseAdmin
            .from('messages')
            .select('id, reactions')
            .eq('id', messageId)
            .single();
          if (fetchError || !existing) break;

          const reactions = { ...(existing.reactions || {}) };
          if (!reactions[emoji]) reactions[emoji] = [];
          const userIndex = reactions[emoji].indexOf(current.nickname);
          if (userIndex >= 0) {
            reactions[emoji].splice(userIndex, 1);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji].push(current.nickname);
          }

          const { data: updated, error: updateError } = await supabaseAdmin
            .from('messages')
            .update({ reactions })
            .eq('id', messageId)
            .select()
            .single();

          if (updateError) {
            log('error', 'Ошибка обновления реакции:', updateError.message);
            break;
          }
          broadcast({ type: 'message_update', data: mapMessageRow(updated) });
          break;
        }

        case 'edit_message': {
          const { messageId, text } = msg.data;
          if (!messageId) break;
          if (typeof text !== 'string') break;

          const { data: existing, error: fetchError } = await supabaseAdmin
            .from('messages')
            .select('user_id, image_url, sticker_url')
            .eq('id', messageId)
            .single();
          if (fetchError || !existing) break;

          if (existing.user_id !== current.userId) {
            log('warn', `Попытка редактировать чужое сообщение: ${current.nickname}`);
            break;
          }

          const safeText = text.trim();
          if (!safeText && !existing.image_url && !existing.sticker_url) break;

          const { data: updated, error: updateError } = await supabaseAdmin
            .from('messages')
            .update({ text: safeText })
            .eq('id', messageId)
            .select()
            .single();

          if (updateError) {
            log('error', 'Ошибка редактирования:', updateError.message);
            break;
          }
          broadcast({ type: 'message_update', data: mapMessageRow(updated) });
          break;
        }

        case 'delete_message': {
          const { messageId } = msg.data;
          if (!messageId) break;

          const { data: existing, error: fetchError } = await supabaseAdmin
            .from('messages')
            .select('user_id')
            .eq('id', messageId)
            .single();
          if (fetchError || !existing) break;

          if (existing.user_id !== current.userId && !isAdmin(current)) {
            log('warn', `Попытка удалить чужое сообщение: ${current.nickname}`);
            break;
          }

          const { error: deleteError } = await supabaseAdmin
            .from('messages')
            .delete()
            .eq('id', messageId);

          if (deleteError) {
            log('error', 'Ошибка удаления:', deleteError.message);
            break;
          }
          broadcast({ type: 'message_deleted', data: { messageId } });
          break;
        }

        // ===== ИЗБРАННЫЕ СТИКЕРЫ =====
        case 'toggle_favorite_sticker': {
          const { stickerUrl } = msg.data || {};
          if (!stickerUrl || typeof stickerUrl !== 'string') break;

          if (!(await isValidStickerUrl(stickerUrl))) {
            log('warn', `[FAV] попытка использовать несуществующий стикер: ${current.nickname}`);
            break;
          }

          const { data: userRow, error: fetchErr } = await supabaseAdmin
            .from('users')
            .select('favorite_stickers')
            .eq('id', current.userId)
            .single();

          if (fetchErr) {
            log('error', '[FAV] fetch error:', fetchErr.message);
            break;
          }

          const list = Array.isArray(userRow?.favorite_stickers)
            ? userRow.favorite_stickers.filter(u => typeof u === 'string')
            : [];

          let next;
          let action;
          if (list.includes(stickerUrl)) {
            next = list.filter(u => u !== stickerUrl);
            action = 'removed';
          } else {
            if (list.length >= MAX_FAVORITE_STICKERS) {
              sendTo(ws, {
                type: 'admin_error',
                data: { message: `Не больше ${MAX_FAVORITE_STICKERS} избранных` },
              });
              break;
            }
            // [2.27.0] Новые добавленные — первыми.
            next = [stickerUrl, ...list];
            action = 'added';
          }

          const { error: saveErr } = await supabaseAdmin
            .from('users')
            .update({ favorite_stickers: next })
            .eq('id', current.userId);

          if (saveErr) {
            log('error', '[FAV] save error:', saveErr.message);
            break;
          }

          sendTo(ws, {
            type: 'favorite_stickers_updated',
            data: { favoriteStickers: next, action, stickerUrl },
          });

          log('info', `[FAV] ${current.nickname} ${action} ${stickerUrl.slice(-20)}`);
          break;
        }

        // ===== ФОН ДИАЛОГОВ =====
        case 'dialogs_bg_update': {
          const { bg } = msg.data || {};

          let nextBg = null;
          if (typeof bg === 'string') {
            const trimmed = bg.trim();
            if (trimmed.length > 0 && trimmed.length <= MAX_DIALOGS_BG_LENGTH) {
              if (trimmed.startsWith('preset:') || trimmed.startsWith('url:')) {
                nextBg = trimmed;
              }
            }
          }

          const { error } = await supabaseAdmin
            .from('users')
            .update({ dialogs_bg: nextBg })
            .eq('id', current.userId);

          if (error) {
            log('error', 'Ошибка сохранения фона диалогов:', error.message);
            sendTo(ws, {
              type: 'dialogs_bg_error',
              data: { message: 'Не удалось сохранить фон' }
            });
            break;
          }

          current.dialogsBg = nextBg;
          sendTo(ws, {
            type: 'dialogs_bg_updated',
            data: { bg: nextBg },
          });
          break;
        }

        // ===== АДМИН: ГЛОБАЛЬНЫЙ ФОН =====
        case 'admin_set_global_bg': {
          if (!isAdmin(current)) break;

          const { bg } = msg.data || {};

          let nextBg = null;
          if (typeof bg === 'string') {
            const trimmed = bg.trim();
            if (trimmed.length > 0 && trimmed.length <= MAX_DIALOGS_BG_LENGTH) {
              if (trimmed.startsWith('preset:') || trimmed.startsWith('url:')) {
                nextBg = trimmed;
              }
            }
          }

          const ok = await setAppSetting('global_dialogs_bg', nextBg);
          if (!ok) {
            sendTo(ws, { type: 'admin_error', data: { message: 'Не удалось сохранить фон' } });
            break;
          }

          log('info', `[SETTINGS] ${current.nickname} установил глобальный фон: ${nextBg || 'сброшен'}`);
          broadcast({
            type: 'global_bg_updated',
            data: { bg: nextBg },
          });
          break;
        }

        // ===== ЛИЧНЫЕ СООБЩЕНИЯ =====
        case 'private_message': {
          const { recipientId, text, imageUrl, stickerUrl, forwardedFrom, voiceUrl, voiceDuration, voiceWaveform, videoUrl, videoDuration, videoMime, isCircle } = msg.data;
          if (!recipientId || (!text && !imageUrl && !stickerUrl && !voiceUrl && !videoUrl)) break;
          if (recipientId === current.userId) break;

          if (await isBlockedEitherWay(current.userId, recipientId)) break;

          if (stickerUrl && !(await isValidStickerUrl(stickerUrl))) {
            log('warn', `[STICKER] попытка использовать несуществующий стикер в личке: ${current.nickname}`);
            break;
          }

          const { data: recipientUser, error: recipientError } = await supabaseAdmin
            .from('users')
            .select('id, nickname')
            .eq('id', recipientId)
            .single();

          if (recipientError || !recipientUser) {
            log('warn', `Личное сообщение несуществующему получателю: ${recipientId} (от ${current.nickname})`);
            break;
          }

          const recipientWs = [...clients.entries()].find(([, c]) => c.userId === recipientId)?.[0];

          let safeForwardedFrom = null;
          if (forwardedFrom && typeof forwardedFrom === 'object') {
            const fn = typeof forwardedFrom.nickname === 'string'
              ? forwardedFrom.nickname.slice(0, 60) : null;
            if (fn) {
              safeForwardedFrom = {
                nickname: fn,
                originalId: typeof forwardedFrom.originalId === 'string'
                  ? forwardedFrom.originalId.slice(0, 100) : null,
                originalTime: Number.isFinite(forwardedFrom.originalTime)
                  ? Number(forwardedFrom.originalTime) : null,
                fromPrivate: !!forwardedFrom.fromPrivate,
              };
            }
          }

          let safeVoiceUrl = null;
          let safeVoiceDuration = null;
          let safeVoiceWaveform = null;
          if (typeof voiceUrl === 'string' && voiceUrl.length > 0) {
            safeVoiceUrl = voiceUrl.slice(0, 500);
            safeVoiceDuration = Number.isFinite(voiceDuration)
              ? Math.min(60, Math.max(0, Number(voiceDuration)))
              : 0;
            if (Array.isArray(voiceWaveform) && voiceWaveform.length > 0 && voiceWaveform.length <= 100) {
              safeVoiceWaveform = voiceWaveform.map(v =>
                Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
              );
            } else {
              safeVoiceWaveform = Array(40).fill(0.3);
            }
          }

          let safeVideoUrl = null;
          let safeVideoDuration = null;
          let safeVideoMime = null;
          if (typeof videoUrl === 'string' && videoUrl.length > 0) {
            safeVideoUrl = videoUrl.slice(0, 500);
            safeVideoDuration = Number.isFinite(videoDuration)
              ? Math.min(60, Math.max(0, Number(videoDuration)))
              : 0;
            if (typeof videoMime === 'string' && videoMime.length > 0 && videoMime.length <= 60) {
              safeVideoMime = videoMime;
            }
          }

          const { data: savedMessage, error } = await supabase
            .from('private_messages')
            .insert([{
              sender_id: current.userId,
              recipient_id: recipientId,
              content: text || '',
              image_url: imageUrl || null,
              sticker_url: stickerUrl || null,
              is_read: false,
              reactions: {},
              forwarded_from: safeForwardedFrom,
              voice_url: safeVoiceUrl,
              voice_duration: safeVoiceDuration,
              voice_waveform: safeVoiceWaveform,
              video_url: safeVideoUrl,
              video_duration: safeVideoDuration,
              video_mime: safeVideoMime,
              is_circle: safeVideoUrl ? isCircle === true : false,
            }])
            .select()
            .single();

          if (error) {
            log('error', 'Ошибка сохранения личного сообщения:', error.message);
            break;
          }

          const messageForClient = {
            id: savedMessage.id,
            senderId: current.userId,
            senderNickname: current.nickname,
            senderAvatar: current.avatarUrl || null,
            recipientId,
            text: savedMessage.content,
            imageUrl: savedMessage.image_url,
            stickerUrl: savedMessage.sticker_url,
            created_at: savedMessage.created_at,
            is_read: false,
            reactions: savedMessage.reactions || {},
            forwardedFrom: savedMessage.forwarded_from || null,
            voiceUrl: savedMessage.voice_url,
            voiceDuration: savedMessage.voice_duration != null ? Number(savedMessage.voice_duration) : null,
            voiceWaveform: savedMessage.voice_waveform || null,
            videoUrl: savedMessage.video_url,
            videoDuration: savedMessage.video_duration != null ? Number(savedMessage.video_duration) : null,
            videoMime: savedMessage.video_mime || null,
            isCircle: savedMessage.is_circle === true,
          };

          sendTo(ws, { type: 'private_message_sent', data: messageForClient });

          if (recipientWs) {
            sendTo(recipientWs, { type: 'private_message', data: messageForClient });
          }

          const lastPreview = savedMessage.content
            || (savedMessage.sticker_url ? '🎨 стикер' : '')
            || (savedMessage.image_url ? '📷 фото' : '')
            || (savedMessage.voice_url ? '🎤 голосовое' : '')
            || (savedMessage.video_url ? '📹 видео' : '');

          sendTo(ws, {
            type: 'dialog_update',
            data: {
              userId: recipientId,
              nickname: recipientUser.nickname,
              lastText: lastPreview,
              lastAt: savedMessage.created_at,
              unread: 0,
              lastFromMe: true,
              lastIsRead: false,
            },
          });
          if (recipientWs) {
            sendTo(recipientWs, {
              type: 'dialog_update',
              data: {
                userId: current.userId,
                nickname: current.nickname,
                lastText: lastPreview,
                lastAt: savedMessage.created_at,
                unread: 'increment',
                lastFromMe: false,
                lastIsRead: false,
              },
            });
          }

          if (!stickerUrl) {
            pushToUser(recipientId, {
              title: `✉️ ${current.nickname}`,
              body: lastPreview || 'Новое сообщение',
              url: '/',
              tag: `pm-${savedMessage.id}`,
            }).catch(err => log('warn', 'pushToUser error:', err.message));
          }

          break;
        }

        case 'mark_read': {
          const { senderId } = msg.data;
          if (!senderId) break;

          const { error, data: updatedMessages } = await supabase
            .from('private_messages')
            .update({ is_read: true })
            .eq('sender_id', senderId)
            .eq('recipient_id', current.userId)
            .eq('is_read', false)
            .select('id, sender_id, recipient_id');

          if (error) {
            log('error', 'Ошибка отметки прочитанных:', error.message);
            break;
          }

          if (updatedMessages && updatedMessages.length > 0) {
            const senderWs = [...clients.entries()].find(([, c]) => c.userId === senderId)?.[0];
            const recipientWs = ws;

            const readData = {
              senderId: senderId,
              recipientId: current.userId,
              messageIds: updatedMessages.map(m => m.id),
            };

            if (senderWs) {
              sendTo(senderWs, { type: 'message_read', data: readData });
              sendTo(senderWs, {
                type: 'dialog_read_update',
                data: { userId: current.userId },
              });
            }
            sendTo(recipientWs, { type: 'message_read', data: readData });

            sendTo(ws, {
              type: 'dialog_unread_reset',
              data: { userId: senderId },
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

        case 'private_reaction': {
          const { messageId, emoji } = msg.data;
          if (!messageId || !emoji) break;

          const { data: existing, error: fetchError } = await supabase
            .from('private_messages')
            .select('reactions, sender_id, recipient_id')
            .eq('id', messageId)
            .single();

          if (fetchError || !existing) break;

          const isParticipant =
            existing.sender_id === current.userId ||
            existing.recipient_id === current.userId;

          if (!isParticipant) break;

          const reactions = { ...(existing.reactions || {}) };
          if (!reactions[emoji]) reactions[emoji] = [];
          const idx = reactions[emoji].indexOf(current.userId);
          if (idx >= 0) {
            reactions[emoji].splice(idx, 1);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji].push(current.userId);
          }

          const { error: saveError } = await supabase
            .from('private_messages')
            .update({ reactions })
            .eq('id', messageId);

          if (saveError) {
            log('error', 'Ошибка сохранения реакции:', saveError.message);
            break;
          }

          const payload = {
            type: 'private_reaction_update',
            data: {
              messageId,
              reactions,
              senderId: existing.sender_id,
              recipientId: existing.recipient_id,
            },
          };

          const senderWs = [...clients.entries()].find(([, c]) => c.userId === existing.sender_id)?.[0];
          const recipientWs = [...clients.entries()].find(([, c]) => c.userId === existing.recipient_id)?.[0];

          if (senderWs) sendTo(senderWs, payload);
          if (recipientWs && recipientWs !== senderWs) sendTo(recipientWs, payload);

          break;
        }

        case 'private_delete_message': {
          const { messageId } = msg.data;
          if (!messageId) break;

          const { data: existing, error: fetchError } = await supabase
            .from('private_messages')
            .select('sender_id, recipient_id')
            .eq('id', messageId)
            .single();

          if (fetchError || !existing) break;

          if (existing.sender_id !== current.userId) {
            log('warn', `[PRIVATE] попытка удалить чужое в личке: ${current.nickname}`);
            break;
          }

          const { error: deleteError } = await supabase
            .from('private_messages')
            .delete()
            .eq('id', messageId);

          if (deleteError) {
            log('error', 'Ошибка удаления в личке:', deleteError.message);
            break;
          }

          const payload = {
            type: 'private_message_deleted',
            data: {
              messageId,
              senderId: existing.sender_id,
              recipientId: existing.recipient_id,
            },
          };

          const senderWs = [...clients.entries()].find(([, c]) => c.userId === existing.sender_id)?.[0];
          const recipientWs = [...clients.entries()].find(([, c]) => c.userId === existing.recipient_id)?.[0];

          if (senderWs) sendTo(senderWs, payload);
          if (recipientWs && recipientWs !== senderWs) sendTo(recipientWs, payload);

          break;
        }

        // ===== ПРОФИЛЬ =====
        case 'profile_get': {
          const { userId } = msg.data || {};
          if (!userId) break;

          const profile = await buildProfile(userId, current.userId);
          if (!profile) {
            sendTo(ws, { type: 'profile_error', data: { message: 'Профиль не найден' } });
            break;
          }

          sendTo(ws, { type: 'profile_data', data: profile });
          break;
        }

        case 'profile_update': {
          const { bio, avatarUrl, font, textColor, textRotation } = msg.data || {};
          const update = {};

          if (typeof bio === 'string') {
            update.bio = bio.slice(0, MAX_BIO_LENGTH);
          }
          if (typeof avatarUrl === 'string') {
            update.avatar_url = avatarUrl || null;
          }
          if (typeof font === 'string') {
            update.font = font.slice(0, 40);
          }
          if (typeof textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(textColor)) {
            update.text_color = textColor;
          }
          if (typeof textRotation === 'number' && Number.isFinite(textRotation)) {
            update.text_rotation = Math.max(-MAX_ROTATION_DEG, Math.min(MAX_ROTATION_DEG, Math.round(textRotation)));
          }
          if (Object.keys(update).length === 0) break;

          const { data: updated, error } = await supabaseAdmin
            .from('users')
            .update(update)
            .eq('id', current.userId)
            .select('id, nickname, role, bio, avatar_url, wins, losses, font, text_color, text_rotation')
            .single();

          if (error) {
            log('error', 'Ошибка обновления профиля:', error.message);
            sendTo(ws, { type: 'profile_error', data: { message: 'Не удалось сохранить' } });
            break;
          }

          current.avatarUrl = updated.avatar_url || null;
          log('info', `[PROFILE] ${current.nickname} обновил профиль`);

          const profile = {
            userId: updated.id,
            nickname: updated.nickname,
            role: updated.role,
            bio: updated.bio || '',
            avatarUrl: updated.avatar_url || null,
            wins: updated.wins || 0,
            losses: updated.losses || 0,
            font: updated.font || 'default',
            textColor: updated.text_color || '#111111',
            textRotation: updated.text_rotation || 0,
            isSelf: true,
            isFriend: false,
          };

          sendTo(ws, { type: 'profile_data', data: profile });

          broadcast({
            type: 'profile_changed',
            data: {
              userId: updated.id,
              nickname: updated.nickname,
              avatarUrl: updated.avatar_url || null,
              bio: updated.bio || '',
              font: updated.font || 'default',
              textColor: updated.text_color || '#111111',
              textRotation: updated.text_rotation || 0,
            },
          });

          break;
        }

        case 'friend_remove': {
          const { friendId } = msg.data || {};
          if (!friendId || friendId === current.userId) break;

          const { error } = await supabaseAdmin
            .from('friends')
            .delete()
            .or(`and(user_id.eq.${current.userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${current.userId})`);

          if (error) {
            log('error', 'Ошибка удаления друга:', error.message);
            break;
          }

          log('info', `[FRIENDS] ${current.nickname} удалил из друзей ${friendId}`);

          const friendWs = [...clients.entries()].find(([, c]) => c.userId === friendId)?.[0];

          sendTo(ws, { type: 'friend_removed', data: { userId: friendId } });
          if (friendWs) sendTo(friendWs, { type: 'friend_removed', data: { userId: current.userId } });

          const myList = await getFriendsList(current.userId);
          sendTo(ws, { type: 'friends_list', data: myList });

          if (friendWs) {
            const hisList = await getFriendsList(friendId);
            sendTo(friendWs, { type: 'friends_list', data: hisList });
          }

          break;
        }

        // ===== БЛОКИРОВКА =====
        case 'block_user': {
          const { userId } = msg.data || {};
          if (!userId || userId === current.userId) break;

          const { data: targetUser } = await supabaseAdmin
            .from('users')
            .select('id, nickname')
            .eq('id', userId)
            .single();
          if (!targetUser) break;

          const { error: insertError } = await supabaseAdmin
            .from('blocks')
            .insert([{ blocker_id: current.userId, blocked_id: userId }]);

          if (insertError && insertError.code !== '23505') {
            log('error', 'Ошибка блокировки:', insertError.message);
            break;
          }

          await supabaseAdmin
            .from('friend_requests')
            .delete()
            .or(`and(sender_id.eq.${current.userId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${current.userId})`);

          await supabaseAdmin
            .from('friends')
            .delete()
            .or(`and(user_id.eq.${current.userId},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${current.userId})`);

          const targetWs = [...clients.entries()].find(([, c]) => c.userId === userId)?.[0];
          const targetClient = targetWs ? clients.get(targetWs) : null;
          if (current.duel && current.duel.opponent === targetClient) {
            current.duel = null;
            if (targetClient) targetClient.duel = null;
          }
          if (targetClient && targetClient.duel && targetClient.duel.opponent === current) {
            targetClient.duel = null;
            current.duel = null;
          }

          const blockedByMe = await getBlockedByMe(current.userId);
          sendTo(ws, { type: 'blocks_list', data: { blocked: blockedByMe } });

          const myFriends = await getFriendsList(current.userId);
          sendTo(ws, { type: 'friends_list', data: myFriends });

          if (targetWs) {
            sendTo(targetWs, { type: 'friend_removed', data: { userId: current.userId } });
            const hisFriends = await getFriendsList(userId);
            sendTo(targetWs, { type: 'friends_list', data: hisFriends });
          }

          await broadcastPlayers();

          log('info', `[BLOCKS] ${current.nickname} заблокировал ${targetUser.nickname}`);
          break;
        }

        case 'unblock_user': {
          const { userId } = msg.data || {};
          if (!userId) break;

          await supabaseAdmin
            .from('blocks')
            .delete()
            .eq('blocker_id', current.userId)
            .eq('blocked_id', userId);

          const blockedByMe = await getBlockedByMe(current.userId);
          sendTo(ws, { type: 'blocks_list', data: { blocked: blockedByMe } });

          await broadcastPlayers();

          log('info', `[BLOCKS] ${current.nickname} разблокировал ${userId}`);
          break;
        }

        // ===== ДУЭЛИ =====
        case 'duel_request': {
          const targetId = msg.data.targetId;
          const targetWs = wsById.get(targetId);
          if (!targetWs) break;
          const target = clients.get(targetWs);
          if (!target || target.id === current.id || target.userId === current.userId) break;
          if (target.bannedUntil && target.bannedUntil > Date.now()) break;

          if (await isBlockedEitherWay(current.userId, target.userId)) break;

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
              await supabaseAdmin.from('users').update({ wins: current.wins }).eq('id', current.userId);
              await supabaseAdmin.from('users').update({ losses: opponent.losses }).eq('id', opponent.userId);
            } else if (result === 'player2') {
              opponent.wins += 1;
              current.losses += 1;
              current.bannedUntil = Date.now() + 60000;
              sendTo(wsOpponent, { type: 'duel_result', data: { result: 'win', opponentNick: current.nickname } });
              sendTo(wsCurrent, { type: 'duel_result', data: { result: 'lose', opponentNick: opponent.nickname } });
              sendTo(wsCurrent, { type: 'banned', data: { until: current.bannedUntil } });
              await supabaseAdmin.from('users').update({ wins: opponent.wins }).eq('id', opponent.userId);
              await supabaseAdmin.from('users').update({ losses: current.losses }).eq('id', current.userId);
            } else {
              sendTo(wsCurrent, { type: 'duel_result', data: { result: 'draw', opponentNick: opponent.nickname } });
              sendTo(wsOpponent, { type: 'duel_result', data: { result: 'draw', opponentNick: current.nickname } });
            }

            current.duel = null;
            opponent.duel = null;
            await broadcastPlayers();
          }
          break;
        }

        // ===== АДМИН =====
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

          await broadcastPlayers();

          const bannedUserIds = await getBannedUserIds();
          broadcast({
            type: 'banned_users_update',
            data: { bannedUserIds },
          });
          break;
        }

        case 'watch_chat': {
          if (!isAdmin(current)) break;
          sendTo(ws, { type: 'admin_error', data: { message: 'Функция в разработке' } });
          break;
        }

        // ===== ДРУЗЬЯ =====
        case 'friend_request': {
          const { receiverId } = msg.data;
          if (!receiverId || receiverId === current.userId) break;

          if (await isBlockedEitherWay(current.userId, receiverId)) {
            sendTo(ws, { type: 'admin_error', data: { message: 'Не получится' } });
            break;
          }

          const { data: receiver, error: userError } = await supabase
            .from('users')
            .select('id, nickname, avatar_url')
            .eq('id', receiverId)
            .single();
          if (userError || !receiver) break;

          const { data: senderRow } = await supabaseAdmin
            .from('users')
            .select('friend_request_cooldowns')
            .eq('id', current.userId)
            .single();

          const cooldowns = (senderRow?.friend_request_cooldowns && typeof senderRow.friend_request_cooldowns === 'object')
            ? { ...senderRow.friend_request_cooldowns }
            : {};

          const { data: incoming } = await supabase
            .from('friend_requests')
            .select('id')
            .eq('sender_id', receiverId)
            .eq('receiver_id', current.userId)
            .limit(1)
            .maybeSingle();

          if (incoming && cooldowns[receiverId]) {
            delete cooldowns[receiverId];
            await supabaseAdmin
              .from('users')
              .update({ friend_request_cooldowns: cooldowns })
              .eq('id', current.userId);
          }

          const cd = cooldowns[receiverId];
          const now = Date.now();

          if (cd && cd.until && cd.until > now) {
            const left = formatCooldownLeft(cd.until - now);
            sendTo(ws, {
              type: 'admin_error',
              data: { message: `Подожди ${left} — недавно отклонили запрос` }
            });
            break;
          }

          const { data: existing } = await supabase
            .from('friend_requests')
            .select('id')
            .eq('sender_id', current.userId)
            .eq('receiver_id', receiverId)
            .eq('status', 'pending')
            .single();

          if (existing) {
            await supabase.from('friend_requests').delete().eq('id', existing.id);
          }

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

          const rejectCount = cd?.count || 0;

          sendTo(ws, {
            type: 'friend_request_sent',
            data: {
              requestId: request.id,
              receiverId,
              receiverNickname: receiver.nickname,
              receiverAvatar: receiver.avatar_url || null,
              rejectCount,
            }
          });

          const receiverWs = [...clients.entries()].find(([, c]) => c.userId === receiverId)?.[0];
          if (receiverWs) {
            sendTo(receiverWs, {
              type: 'new_friend_request',
              data: {
                requestId: request.id,
                senderId: current.userId,
                senderNickname: current.nickname,
                senderAvatar: current.avatarUrl || null,
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

          if (await isBlockedEitherWay(current.userId, request.sender_id)) break;

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
            .delete()
            .eq('id', requestId);

          const { data: senderRow } = await supabaseAdmin
            .from('users')
            .select('friend_request_cooldowns')
            .eq('id', request.sender_id)
            .single();

          if (senderRow?.friend_request_cooldowns && senderRow.friend_request_cooldowns[current.userId]) {
            const next = { ...senderRow.friend_request_cooldowns };
            delete next[current.userId];
            await supabaseAdmin
              .from('users')
              .update({ friend_request_cooldowns: next })
              .eq('id', request.sender_id);
          }

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
          sendTo(ws, notifyData);

          const sendFriendsList = async (userId, wsTo) => {
            const { data: friendIds } = await supabase
              .from('friends')
              .select('friend_id')
              .eq('user_id', userId);
            if (friendIds && friendIds.length > 0) {
              const ids = friendIds.map(f => f.friend_id);
              const { data: users } = await supabase
                .from('users')
                .select('id, nickname, avatar_url')
                .in('id', ids);
              if (users) {
                wsTo.send(JSON.stringify({
                  type: 'friends_list',
                  data: users.map(u => ({
                    userId: u.id,
                    nickname: u.nickname,
                    avatarUrl: u.avatar_url || null,
                  }))
                }));
              }
            } else {
              wsTo.send(JSON.stringify({ type: 'friends_list', data: [] }));
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
            .delete()
            .eq('id', requestId);

          const { data: senderRow } = await supabaseAdmin
            .from('users')
            .select('friend_request_cooldowns')
            .eq('id', request.sender_id)
            .single();

          const cooldowns = (senderRow?.friend_request_cooldowns && typeof senderRow.friend_request_cooldowns === 'object')
            ? { ...senderRow.friend_request_cooldowns }
            : {};

          const prev = cooldowns[current.userId] || { count: 0 };
          const nextCount = (prev.count || 0) + 1;
          const cooldownMs = calcFriendCooldownMs(nextCount);

          cooldowns[current.userId] = {
            count: nextCount,
            until: Date.now() + cooldownMs,
          };

          await supabaseAdmin
            .from('users')
            .update({ friend_request_cooldowns: cooldowns })
            .eq('id', request.sender_id);

          const senderWs = [...clients.entries()].find(([, c]) => c.userId === request.sender_id)?.[0];
          if (senderWs) {
            sendTo(senderWs, {
              type: 'friend_request_declined',
              data: {
                userId: current.userId,
                nickname: current.nickname,
                avatarUrl: current.avatarUrl || null,
              }
            });
          }
          break;
        }

        case 'get_friends': {
          const list = await getFriendsList(current.userId);
          sendTo(ws, { type: 'friends_list', data: list });
          break;
        }

        // ===== ХРАНИЛИЩЕ =====
        case 'storage_save': {
          const { type, payload, source } = msg.data || {};
          if (!type || !payload) break;
          if (!['text','image','sticker','voice','video'].includes(type)) break;

          const sourceMsgId = source?.messageId || null;

          // Дубликат по messageId
          if (sourceMsgId) {
            const { data: dup } = await supabaseAdmin
              .from('storage_items')
              .select('id')
              .eq('user_id', current.userId)
              .eq('source->>messageId', sourceMsgId)
              .maybeSingle();
            if (dup) {
              sendTo(ws, { type: 'storage_error', data: { message: 'Уже в хранилище' } });
              break;
            }
          }

          // Лимит
          const { count } = await supabaseAdmin
            .from('storage_items')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', current.userId);
          if ((count || 0) >= MAX_STORAGE_ITEMS) {
            sendTo(ws, { type: 'storage_error', data: { message: 'Хранилище переполнено' } });
            break;
          }

          const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const sortOrder = Date.now();

          const { data: row, error } = await supabaseAdmin
            .from('storage_items')
            .insert([{
              id,
              user_id: current.userId,
              type,
              payload,
              source: source || null,
              sort_order: sortOrder,
            }])
            .select()
            .single();

          if (error) {
            log('error', 'Ошибка сохранения в хранилище:', error.message);
            sendTo(ws, { type: 'storage_error', data: { message: 'Не удалось сохранить' } });
            break;
          }

          sendTo(ws, {
            type: 'storage_saved',
            data: {
              id: row.id,
              type: row.type,
              payload: row.payload,
              source: row.source,
              savedAt: row.saved_at,
              sortOrder: row.sort_order,
            },
          });

          log('info', `[STORAGE] ${current.nickname} сохранил ${type}`);
          break;
        }

        case 'storage_delete': {
          const { id } = msg.data || {};
          if (!id) break;

          const { error } = await supabaseAdmin
            .from('storage_items')
            .delete()
            .eq('id', id)
            .eq('user_id', current.userId);

          if (error) {
            log('error', 'Ошибка удаления из хранилища:', error.message);
            break;
          }

          sendTo(ws, { type: 'storage_deleted', data: { id } });
          break;
        }

        case 'storage_reorder': {
          const { ids } = msg.data || {};
          if (!Array.isArray(ids) || ids.length === 0) break;

          // ids — массив id в новом порядке. Меняем sort_order по индексу.
          const updates = ids.map((itemId, idx) => ({
            id: itemId,
            user_id: current.userId,
            sort_order: idx,
          }));

          // Тихо: только те, что реально наши
          const { data: owned } = await supabaseAdmin
            .from('storage_items')
            .select('id')
            .eq('user_id', current.userId)
            .in('id', ids);
          const ownedSet = new Set((owned || []).map(r => r.id));

          const filtered = updates.filter(u => ownedSet.has(u.id));
          if (filtered.length === 0) break;

          for (const u of filtered) {
            await supabaseAdmin
              .from('storage_items')
              .update({ sort_order: u.sort_order })
              .eq('id', u.id)
              .eq('user_id', current.userId);
          }

          sendTo(ws, { type: 'storage_reordered', data: { ids: filtered.map(f => f.id) } });
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

  ws.on('close', (code, reasonBuf) => {
    clearTimeout(authTimeout);
    if (client.pendingInviteTimeout) clearTimeout(client.pendingInviteTimeout);
    clients.delete(ws);
    wsById.delete(client.id);
    broadcastPlayers().catch(err => log('error', 'broadcastPlayers on close:', err.message));
    const reason = reasonBuf?.toString() || '';
    log('info', `Соединение закрыто: ${client.id} (код ${code}${reason ? ', ' + reason : ''})`);
  });
});

log('info', `Сервер запущен (HTTP + WebSocket) на порту ${PORT}`);