import React, { useState, useEffect, useRef } from 'react';
import { getAvatarColor, getInitial } from '../utils';
import ConfirmModal from './ConfirmModal';
import Avatar from './Avatar';

/*
  [2.35.4] MAX_AVATAR_MB: 2 → 25, синхронизация с бэком и InfoPanel
  [2.32.40] bio: «Сохранено ✓» через локальный таймер, а не через data.
            Кнопка гаснет после сохранения.
            Удаление из друзей — через ConfirmModal (danger),
            не через window.confirm.
  [2.21.0] Кастомизация bio: 7 шрифтов, цвет, поворот.
  [2.20.0] Профиль: bio, аватар, удаление друга.
*/

const MAX_BIO = 200;
const MAX_AVATAR_MB = 25;
const MAX_ROTATION = 15;

const FONTS = [
  { id: 'default',   name: 'Обычный',   css: 'inherit' },
  { id: 'unbounded', name: 'Unbounded', css: "'Unbounded', sans-serif" },
  { id: 'caveat',    name: 'Caveat',    css: "'Caveat', cursive" },
  { id: 'pacifico',  name: 'Pacifico',  css: "'Pacifico', cursive" },
  { id: 'cormorant', name: 'Cormorant', css: "'Cormorant Garamond', serif" },
  { id: 'amatic',    name: 'Amatic',    css: "'Amatic SC', cursive" },
  { id: 'marck',     name: 'Marck',     css: "'Marck Script', cursive" },
  { id: 'neucha',    name: 'Neucha',    css: "'Neucha', cursive" },
];

const TEXT_COLORS = [
  '#111111', '#FFFFFF', '#3BB5E8', '#E11D48',
  '#F5A9C0', '#22C55E', '#A855F7', '#F59E0B',
];

const getFontCss = (id) => FONTS.find(f => f.id === id)?.css || 'inherit';

const ProfilePanel = ({
  data,
  onClose,
  onSave,
  onRemoveFriend,
  onOpenPrivateChat,
  onRequestDuel,
  token,
  apiUrl,
  onOpenStorage,
}) => {
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [font, setFont] = useState('default');
  const [textColor, setTextColor] = useState('#111111');
  const [textRotation, setTextRotation] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!data) return;
    setBio(data.bio || '');
    setAvatarUrl(data.avatarUrl || null);
    setFont(data.font || 'default');
    setTextColor(data.textColor || '#111111');
    setTextRotation(data.textRotation || 0);
    setError('');
  }, [data?.userId, data?.bio, data?.avatarUrl, data?.font, data?.textColor, data?.textRotation]);

  if (!data) {
    return (
      <>
        <div className="profile-overlay" onClick={onClose} />
        <div className="profile-panel profile-panel--loading">
          <div className="profile-loading-text">Загрузка…</div>
          <button className="profile-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
      </>
    );
  }

  const isSelf = !!data.isSelf;
  const isAdmin = data.role === 'admin';
  const dirty =
    bio !== (data.bio || '') ||
    (avatarUrl || null) !== (data.avatarUrl || null) ||
    font !== (data.font || 'default') ||
    textColor !== (data.textColor || '#111111') ||
    textRotation !== (data.textRotation || 0);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) { setError('Только изображения'); return; }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) { setError(`Файл больше ${MAX_AVATAR_MB} МБ`); return; }

    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('token', token);
      const res = await fetch(`${apiUrl}/api/upload-avatar`, { method: 'POST', body: fd });
      const resp = await res.json();
      if (!res.ok) throw new Error(resp.error || 'Upload failed');
      setAvatarUrl(resp.avatarUrl);
      onSave(bio.slice(0, MAX_BIO), resp.avatarUrl, font, textColor, textRotation);
    } catch (err) {
      setError('Не удалось загрузить: ' + (err?.message || ''));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    if (!dirty) return;
    onSave(bio.slice(0, MAX_BIO), avatarUrl, font, textColor, textRotation);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  const handleRemoveFriend = () => {
    setRemoveConfirm(true);
  };

  const confirmRemoveFriend = () => {
    onRemoveFriend(data.userId);
    setRemoveConfirm(false);
  };

  const bioStyle = {
    fontFamily: getFontCss(font),
    color: textColor,
    transform: `rotate(${textRotation}deg)`,
    transformOrigin: 'left center',
  };

  return (
    <>
      <div className="profile-overlay" onClick={onClose} />
      <div className="profile-panel">
        <button className="profile-close" onClick={onClose} aria-label="Закрыть">✕</button>

        <div className="profile-header">
          <Avatar
            src={avatarUrl}
            nickname={data.nickname}
            className="profile-avatar"
            alt=""
          />
          <div className="profile-name-row">
            <div className="profile-nick">{data.nickname}</div>
            {isAdmin && <div className="profile-role">админ</div>}
          </div>
          <div className="profile-stats">🏆 {data.wins} · 💀 {data.losses}</div>

          {isSelf && (
            <>
              <button
                type="button"
                className="profile-avatar-btn"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Загрузка…' : '📷 Сменить фото'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFile}
              />
            </>
          )}
        </div>

        <div className="profile-body">
          <div className="profile-section-label">О себе</div>

          <div className="profile-bio-stage">
            {isSelf ? (
              <textarea
                className="profile-bio-input profile-bio-styled"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
                placeholder="Пара слов о себе…"
                rows={3}
                style={bioStyle}
              />
            ) : (
              <div className="profile-bio-read profile-bio-styled" style={bioStyle}>
                {data.bio ? data.bio : <i>Пока ничего не рассказал</i>}
              </div>
            )}
          </div>

          {isSelf && (
            <>
              <div className="profile-bio-count">{bio.length} / {MAX_BIO}</div>

              <div className="profile-custom">
                <div className="profile-section-label">Шрифт</div>
                <div className="profile-font-row">
                  {FONTS.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className={`profile-font-tile ${font === f.id ? 'active' : ''}`}
                      style={{ fontFamily: f.css }}
                      onClick={() => setFont(f.id)}
                      title={f.name}
                    >
                      Аa
                    </button>
                  ))}
                </div>

                <div className="profile-section-label">Цвет текста</div>
                <div className="profile-color-row">
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`profile-color-swatch ${textColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setTextColor(c)}
                      aria-label={c}
                    />
                  ))}
                  <label className="profile-color-custom" title="Свой цвет">
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                    />
                    <span>🎨</span>
                  </label>
                </div>

                <div className="profile-section-label">
                  Поворот: {textRotation > 0 ? '+' : ''}{textRotation}°
                </div>
                <div className="profile-rotation-row">
                  <input
                    type="range"
                    min={-MAX_ROTATION}
                    max={MAX_ROTATION}
                    step={1}
                    value={textRotation}
                    onChange={(e) => setTextRotation(Number(e.target.value))}
                    className="profile-rotation-slider"
                  />
                  <button
                    type="button"
                    className="profile-rotation-reset"
                    onClick={() => setTextRotation(0)}
                    title="Сбросить"
                  >
                    ↺
                  </button>
                </div>
              </div>

              {error && <div className="profile-error">{error}</div>}

              <button
                className="btn profile-save-btn"
                onClick={handleSave}
                disabled={!dirty || uploading}
              >
                {justSaved ? 'Сохранено ✓' : 'Сохранить'}
              </button>

              {onOpenStorage && (
                <button
                  type="button"
                  className="btn profile-storage-btn"
                  onClick={() => { onClose(); onOpenStorage(); }}
                >
                  🗄️ Моё хранилище
                </button>
              )}
            </>
          )}
        </div>

        {!isSelf && (
          <div className="profile-actions">
            <button className="btn profile-action-btn" onClick={() => onOpenPrivateChat(data.userId, data.nickname)}>
              ✉️ Написать
            </button>
            <button className="btn profile-action-btn" onClick={() => onRequestDuel()}>
              ⚔️ Дуэль
            </button>
            {data.isFriend && (
              <button
                className="btn profile-action-btn profile-action-btn--danger"
                onClick={handleRemoveFriend}
              >
                💔 Удалить из друзей
              </button>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={removeConfirm}
        title={`Удалить ${data.nickname} из друзей?`}
        description="Вы больше не будете видеть друг друга в списке друзей."
        confirmText="Удалить"
        danger
        zIndex={1600}
        onConfirm={confirmRemoveFriend}
        onCancel={() => setRemoveConfirm(false)}
      />
    </>
  );
};

export default ProfilePanel;