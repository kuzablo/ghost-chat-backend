import { forwardRef, useRef, useEffect, useState, memo } from 'react';
import { getAvatarColor, getInitial, formatMessageDate } from '../utils';
import DialogsBgPicker, { PRESETS_MAP } from './DialogsBgPicker';
import Avatar from './Avatar';

/*
  [2.36.3] globalDialogsBg — эффективный фон = личный || глобальный
  [2.35.28] Поиск по имени + плейсхолдер для URL-фона.
*/
const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 8;

const getBgCss = (bg) => {
  if (!bg) return null;
  if (bg.startsWith('preset:')) {
    const id = bg.slice('preset:'.length);
    return PRESETS_MAP[id] || null;
  }
  if (bg.startsWith('url:')) {
    const url = bg.slice('url:'.length);
    return `url(${url})`;
  }
  return null;
};

const isUrlBg = (bg) => !!(bg && bg.startsWith('url:'));

const DialogsPanel = forwardRef(({
  dialogs,
  players,
  myId,
  dialogsBg,
  globalDialogsBg,
  onSaveDialogsBg,
  onSetGlobalBg,
  isAdmin,
  token,
  onOpen,
  onClose,
  onOpenProfile,
}, ref) => {
  const isOnline = (userId) => players.some(p => p.userId === userId);

  const effectiveBg = dialogsBg || globalDialogsBg || null;

  const panelRef = useRef(null);
  const swipeRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    direction: null,
    lastDx: 0,
  });

  const pressRef = useRef({
    timer: null,
    startX: 0,
    startY: 0,
    fired: false,
    userId: null,
  });
  const [pressingUserId, setPressingUserId] = useState(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    if (typeof ref === 'function') ref(panelRef.current);
    else if (ref) ref.current = panelRef.current;
  }, [ref]);

  useEffect(() => () => {
    if (pressRef.current.timer) clearTimeout(pressRef.current.timer);
  }, []);

  useEffect(() => {
    const isUrl = isUrlBg(effectiveBg);
    if (!isUrl) {
      setBgLoaded(true);
      return;
    }
    setBgLoaded(false);
    const url = effectiveBg.slice('url:'.length);
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.onerror = () => setBgLoaded(true);
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBg]);

  const cancelPress = () => {
    if (pressRef.current.timer) {
      clearTimeout(pressRef.current.timer);
      pressRef.current.timer = null;
    }
    setPressingUserId(null);
  };

  const startPress = (userId, e) => {
    e.stopPropagation();
    if (!onOpenProfile) return;
    const t = e.touches ? e.touches[0] : e;
    pressRef.current.startX = t.clientX;
    pressRef.current.startY = t.clientY;
    pressRef.current.userId = userId;
    pressRef.current.fired = false;
    setPressingUserId(userId);
    pressRef.current.timer = setTimeout(() => {
      pressRef.current.timer = null;
      pressRef.current.fired = true;
      setPressingUserId(null);
      const d = dialogs.find(x => x.userId === userId);
      if (d) onOpenProfile(d.userId, d.nickname);
    }, LONG_PRESS_MS);
  };

  const movePress = (e) => {
    if (!pressRef.current.timer) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - pressRef.current.startX;
    const dy = t.clientY - pressRef.current.startY;
    if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) {
      cancelPress();
    }
  };

  const endPress = () => {
    cancelPress();
  };

  const getSectionKey = (timestamp) => {
    if (!timestamp) return 'old';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const d = new Date(timestamp);
    if (d >= today) return 'today';
    if (d >= yesterday) return 'yesterday';
    return 'old';
  };

  const sectionLabel = {
    today: 'Сегодня',
    yesterday: 'Вчера',
    old: 'Раньше',
  };

  const visibleDialogs = dialogs.filter(d => d.userId !== myId);

  const query = searchQuery.trim().toLowerCase();
  const filteredDialogs = query
    ? visibleDialogs.filter(d => (d.nickname || '').toLowerCase().includes(query))
    : visibleDialogs;

  const sections = [];
  let currentKey = null;
  filteredDialogs.forEach(d => {
    const key = getSectionKey(d.lastAt);
    if (key !== currentKey) {
      sections.push({ key, label: sectionLabel[key], items: [] });
      currentKey = key;
    }
    sections[sections.length - 1].items.push(d);
  });

  const totalUnread = visibleDialogs.reduce((sum, d) => sum + (d.unread || 0), 0);
  const onlineCount = visibleDialogs.filter(d => isOnline(d.userId)).length;

  const SWIPE_THRESHOLD = 80;
  const SWIPE_MAX = 200;
  const DIRECTION_LOCK = 8;

  const resetPanel = (animated = true) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = animated
      ? 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)'
      : 'none';
    el.style.transform = '';
    if (animated) {
      setTimeout(() => {
        if (panelRef.current) panelRef.current.style.transition = '';
      }, 240);
    }
  };

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    if (pressRef.current.timer) return;
    const t = e.touches[0];
    const s = swipeRef.current;
    s.active = true;
    s.startX = t.clientX;
    s.startY = t.clientY;
    s.direction = null;
    s.lastDx = 0;
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e) => {
    const s = swipeRef.current;
    if (!s.active) return;
    if (e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;

    if (!s.direction) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      s.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (s.direction === 'vertical') return;

    const off = Math.min(Math.abs(dx), SWIPE_MAX);
    s.lastDx = off;
    if (panelRef.current) {
      const sign = dx > 0 ? 1 : -1;
      panelRef.current.style.transform = `translateX(${sign * off}px)`;
    }
    if (e.cancelable) e.preventDefault();
  };

  const handleTouchEnd = (e) => {
    const s = swipeRef.current;
    if (!s.active) return;
    s.active = false;

    if (s.direction === 'horizontal' && s.lastDx > SWIPE_THRESHOLD) {
      onClose();
      return;
    }
    resetPanel(true);
    s.direction = null;
    s.lastDx = 0;
  };

  const pulseAmp = 1 + Math.min(onlineCount, 6) * 0.5;
  const pulseSpeed = 1.4 + Math.min(totalUnread, 8) * 0.35;

  const renderAvatar = (d) => {
    const online = isOnline(d.userId);
    const hasUnread = d.unread > 0;
    const isPressing = pressingUserId === d.userId;

    return (
      <div
        className="dialog-avatar-wrap"
        onMouseDown={(e) => startPress(d.userId, e)}
        onMouseMove={movePress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={(e) => startPress(d.userId, e)}
        onTouchMove={movePress}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
      >
        <Avatar
          src={d.avatarUrl}
          nickname={d.nickname}
          className={`dialog-avatar ${hasUnread ? 'dialog-avatar--unread' : ''}`}
          alt=""
        />
        {online && <span className="dialog-online-dot" aria-label="в сети" />}
        {hasUnread && <span className="dialog-unread-pulse" aria-hidden="true" />}
        {isPressing && (
          <svg
            className="dialog-press-ring"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="dialog-press-ring-path"
            />
          </svg>
        )}
      </div>
    );
  };

  const bgCss = getBgCss(effectiveBg);
  const hasBg = !!bgCss;
  const bgIsUrl = isUrlBg(effectiveBg);

  const showBgLoading = bgIsUrl && !bgLoaded;

  const panelStyle = hasBg && !showBgLoading
    ? bgIsUrl
      ? {
        backgroundImage: bgCss,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
      : { background: bgCss }
    : undefined;

  return (
    <>
      <div
        className="dialogs-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`dialogs-panel ${hasBg ? 'dialogs-panel--custom' : ''}`}
        ref={panelRef}
        style={panelStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <header className="dialogs-header">
          <div className="dialogs-pulse" aria-hidden="true">
            <svg
              className="dialogs-pulse-svg"
              viewBox="0 0 40 12"
              preserveAspectRatio="none"
              width="40"
              height="12"
            >
              <defs>
                <linearGradient id="dlg-pulse-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--btn-bg)" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="var(--btn-bg)" stopOpacity="1" />
                  <stop offset="100%" stopColor="var(--btn-bg)" stopOpacity="0.2" />
                </linearGradient>
              </defs>
              <path
                className="dialogs-pulse-path"
                d="M 0 6 Q 10 1 20 6 T 40 6"
                fill="none"
                stroke="url(#dlg-pulse-grad)"
                strokeWidth="1.5"
                strokeLinecap="round"
                style={{
                  animationDuration: `${pulseSpeed}s`,
                  transformOrigin: 'center',
                }}
              />
            </svg>
          </div>

          <div className="dialogs-header-text">
            <h4 className="dialogs-title">Мои диалоги</h4>
            <div className="dialogs-header-sub">
              {visibleDialogs.length === 0
                ? 'тишина'
                : `${onlineCount} в сети${totalUnread > 0 ? ` · ${totalUnread} новых` : ''}`
              }
            </div>
          </div>

          <button
            type="button"
            className="dialogs-header-bg-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowBgPicker(true);
            }}
            title="Фон окна"
            aria-label="Фон окна"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </button>
        </header>

        <div className="dialogs-search-wrap">
          <input
            className="dialogs-search-input"
            type="text"
            placeholder="Поиск по имени..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="dialogs-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Очистить"
            >
              ✕
            </button>
          )}
        </div>

        <div className="dialogs-list">
          {showBgLoading && (
            <div className="dialogs-bg-loading" aria-hidden="true">
              <div className="dialogs-bg-loading-mascot" />
            </div>
          )}

          {visibleDialogs.length === 0 && (
            <div className="dialogs-empty">
              <div className="dialogs-empty-orbit">
                <span className="dialogs-empty-dot" />
                <span className="dialogs-empty-dot" />
                <span className="dialogs-empty-dot" />
              </div>
              <div className="dialogs-empty-title">Здесь пока тихо</div>
              <div className="dialogs-empty-text">
                Открой панель пользователей <b>👥</b>, найди кого-нибудь,
                нажми <b>✉️</b> — и начнётся первый разговор.
              </div>
            </div>
          )}

          {visibleDialogs.length > 0 && filteredDialogs.length === 0 && (
            <div className="dialogs-search-empty">
              Ничего не найдено
            </div>
          )}

          {sections.map(section => (
            <div key={section.key} className="dialogs-section">
              <div className="dialogs-section-label">
                <span className="dialogs-section-line" />
                <span className="dialogs-section-text">{section.label}</span>
                <span className="dialogs-section-line" />
              </div>

              {section.items.map(d => {
                const hasUnread = d.unread > 0;
                return (
                  <div key={d.userId} className="dialog-card-wrap">
                    <button
                      type="button"
                      className={`dialog-card ${hasUnread ? 'dialog-card--unread' : ''}`}
                      onClick={() => onOpen(d.userId, d.nickname)}
                    >
                      {renderAvatar(d)}

                      <div className="dialog-body">
                        <div className="dialog-top">
                          <span className="dialog-nick">{d.nickname}</span>
                          <span className="dialog-time">
                            {formatMessageDate(d.lastAt)}
                          </span>
                        </div>
                        <div className="dialog-bottom">
                          <span className="dialog-preview">
                            {d.lastText || '· · ·'}
                          </span>
                          {hasUnread && (
                            <span className="dialog-badge">
                              {d.unread > 99 ? '99+' : d.unread}
                            </span>
                          )}
                          {!hasUnread && d.lastFromMe && d.lastIsRead === false && (
                            <span className="dialog-sent-dot" aria-label="Отправлено" />
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {showBgPicker && (
        <DialogsBgPicker
          current={dialogsBg}
          onClose={() => setShowBgPicker(false)}
          onSave={onSaveDialogsBg}
          token={token}
          isAdmin={isAdmin}
          onSetGlobalForAll={onSetGlobalBg}
        />
      )}
    </>
  );
});

DialogsPanel.displayName = 'DialogsPanel';

export default memo(DialogsPanel);