import { forwardRef, useState, useRef, useEffect, memo } from 'react';
import { getAvatarColor, getInitial } from '../utils';
import StickerMenu from './StickerMenu';
import OrbitNotification from './OrbitNotification';
import Avatar from './Avatar';

/*
  [2.48.5] Скролл — у секций «Онлайн», «Друзья», «Запросы».
           Шапка/поиск/я/«О приложении» — зафиксированы.
  [2.39.0] Узел орбиты в шапке рендерится всегда.
  [2.35.34] Плейсхолдер-маскот и орбита в шапке разделены.
  [2.35.25] visible — панель всегда в DOM.
*/

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 8;

const getBgCss = (bg) => {
  if (!bg) return null;
  if (bg.startsWith('preset:')) return null;
  if (bg.startsWith('url:')) {
    return `url(${bg.slice('url:'.length)})`;
  }
  return null;
};

const isUrlBg = (bg) => !!(bg && bg.startsWith('url:'));

const PlayersPanel = forwardRef(({
  visible = true,
  players,
  friends,
  friendRequests,
  myId,
  searchQuery,
  setSearchQuery,
  unreadByUser,
  isAdmin,
  blockedIds = new Set(),
  dialogsBg = null,
  unreadUserObjects = [],
  orbitSlotRef = null,
  orbitHidden = false,
  onWatchChat,
  onBanConfirm,
  onRequestDuel,
  onOpenPrivateChat,
  onFriendRequest,
  onBlockConfirm,
  onAcceptRequest,
  onDeclineRequest,
  onOpenInfo,
  onLogout,
  onOpenDialogs,
  onOpenProfile,
}, ref) => {
  const isFriendOnline = (friendId) => players.some(p => p.userId === friendId);

  const filteredPlayers = players.filter(p =>
    p.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const friendIds = new Set(friends.map(f => f.userId));
  const nonFriends = filteredPlayers.filter(p => !friendIds.has(p.userId) && p.userId !== myId);
  const filteredFriends = friends.filter(f =>
    f.nickname.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const myself = players.find(p => p.userId === myId);

  const unreadDialogs = Object.values(unreadByUser || {}).filter(Boolean).length;

  const [pressingId, setPressingId] = useState(null);
  const [menuTarget, setMenuTarget] = useState(null);
  const pressRef = useRef({ timer: null, startX: 0, startY: 0, fired: false, id: null });

  const [selfHintDismissed, setSelfHintDismissed] = useState(() => {
    try { return localStorage.getItem('ghost-chat-self-hint-seen') === '1'; }
    catch { return false; }
  });

  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    const isUrl = isUrlBg(dialogsBg);
    if (!isUrl) {
      setBgLoaded(true);
      return;
    }
    setBgLoaded(false);
    const url = dialogsBg.slice('url:'.length);
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.onerror = () => setBgLoaded(true);
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [dialogsBg]);

  const cancelPress = () => {
    if (pressRef.current.timer) {
      clearTimeout(pressRef.current.timer);
      pressRef.current.timer = null;
    }
    setPressingId(null);
  };

  useEffect(() => () => cancelPress(), []);

  const openMenuForSelf = () => {
    if (!selfHintDismissed) {
      setSelfHintDismissed(true);
      try { localStorage.setItem('ghost-chat-self-hint-seen', '1'); } catch { /* noop */ }
    }

    const items = [];
    items.push({
      icon: '👤',
      label: 'Профиль',
      onClick: () => onOpenProfile(myId, myself?.nickname),
    });
    if (onOpenDialogs) {
      items.push({
        icon: '💬',
        label: 'Диалоги',
        onClick: onOpenDialogs,
        badge: unreadDialogs > 0 ? unreadDialogs : null,
      });
    }
    if (onLogout) {
      items.push({ icon: '🚪', label: 'Выйти', onClick: onLogout, danger: true });
    }
    setMenuTarget({ title: myself?.nickname || 'Вы', subtitle: 'Действия', items });
  };

  const openMenuForPlayer = (p) => {
    const items = [];
    items.push({
      icon: '👤',
      label: 'Профиль',
      onClick: () => onOpenProfile(p.userId, p.nickname),
    });
    if (isAdmin) {
      items.push({ icon: 'ℹ️', label: 'Инфо', onClick: () => onWatchChat(p.userId) });
    }
    items.push({ icon: '✉️', label: 'Написать', onClick: () => onOpenPrivateChat(p.userId, p.nickname) });
    items.push({ icon: '⚔️', label: 'Дуэль', onClick: () => onRequestDuel(p.userId) });
    items.push({ icon: '🤝', label: 'В друзья', onClick: () => onFriendRequest(p.userId) });

    if (!blockedIds.has(p.userId) && onBlockConfirm) {
      items.push({
        icon: '🚫',
        label: 'Заблокировать',
        onClick: () => onBlockConfirm(p.userId, p.nickname),
        danger: true,
      });
    }

    if (isAdmin) {
      items.push({ icon: '⛔', label: 'Забанить', onClick: () => onBanConfirm(p.userId, p.nickname), danger: true });
    }
    setMenuTarget({ title: p.nickname, subtitle: 'Действия', items });
  };

  const openMenuForFriend = (f) => {
    const items = [
      { icon: '👤', label: 'Профиль', onClick: () => onOpenProfile(f.userId, f.nickname) },
      { icon: '✉️', label: 'Написать', onClick: () => onOpenPrivateChat(f.userId, f.nickname) },
      { icon: '⚔️', label: 'Дуэль', onClick: () => onRequestDuel(f.userId) },
    ];
    if (!blockedIds.has(f.userId) && onBlockConfirm) {
      items.push({
        icon: '🚫',
        label: 'Заблокировать',
        onClick: () => onBlockConfirm(f.userId, f.nickname),
        danger: true,
      });
    }
    setMenuTarget({ title: f.nickname, subtitle: 'Друг', items });
  };

  const startPress = (id, e, onFire) => {
    if (e.target.closest('.player-action-btn')) return;
    if (e.target.closest('.players-info-link')) return;
    const t = e.touches ? e.touches[0] : e;
    pressRef.current.startX = t.clientX;
    pressRef.current.startY = t.clientY;
    pressRef.current.id = id;
    pressRef.current.fired = false;
    setPressingId(id);
    pressRef.current.timer = setTimeout(() => {
      pressRef.current.timer = null;
      pressRef.current.fired = true;
      setPressingId(null);
      onFire();
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

  const isPressing = (id) => pressingId === id;

  const renderAvatar = (nickname, avatarUrl) => (
    <Avatar
      src={avatarUrl}
      nickname={nickname}
      className="player-avatar"
      alt=""
      mascot={false}
    />
  );

  const bgCss = getBgCss(dialogsBg);
  const hasBg = !!bgCss;
  const bgIsUrl = isUrlBg(dialogsBg);
  const showBgLoading = bgIsUrl && !bgLoaded;

  const panelStyle = hasBg && !showBgLoading
    ? {
        backgroundImage: bgCss,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    : undefined;

  return (
    <>
      <div
        className={[
          'players-overlay',
          visible ? '' : 'players-overlay--hidden',
          hasBg ? 'players-overlay--custom' : '',
        ].filter(Boolean).join(' ')}
        ref={ref}
        style={panelStyle}
      >
        {showBgLoading && (
          <div className="players-bg-loading" aria-hidden="true">
            <div className="players-bg-loading-mascot" />
          </div>
        )}

        {/* [2.39.0] Узел орбиты рендерится всегда. Ref валиден в любой момент */}
        <div
          ref={orbitSlotRef}
          className="players-header players-header--orbit"
        >
          {!orbitHidden && (
            unreadUserObjects.length > 0 ? (
              <OrbitNotification
                users={unreadUserObjects}
                onClick={onOpenDialogs}
                className="pm-orbit--header"
              />
            ) : (
              <img
                src="/mascot.png"
                alt=""
                className="players-header-mascot-solo"
                draggable={false}
              />
            )
          )}
        </div>

        <input
          className="search-input"
          type="text"
          placeholder="Поиск по нику..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="players-list">

          {myself && (
            <div
              className={`player-item player-item--self ${isPressing(`self-${myself.userId}`) ? 'player-item--pressing' : ''}`}
              onTouchStart={(e) => startPress(`self-${myself.userId}`, e, openMenuForSelf)}
              onTouchMove={movePress}
              onTouchEnd={endPress}
              onTouchCancel={endPress}
              onMouseDown={(e) => startPress(`self-${myself.userId}`, e, openMenuForSelf)}
              onMouseMove={movePress}
              onMouseUp={endPress}
              onMouseLeave={endPress}
            >
              {renderAvatar(myself.nickname, myself.avatarUrl)}
              <span className="player-name">
                {myself.nickname}
                <small className="player-stats">W:{myself.wins} L:{myself.losses}</small>
              </span>
              {!selfHintDismissed && (
                <span className="player-hint" aria-hidden="true">
                  👆 нажми и держи
                </span>
              )}
              {onLogout && (
                <div className="player-actions">
                  <button
                    className="player-action-btn player-action-btn--danger"
                    onClick={(e) => { e.stopPropagation(); onLogout(); }}
                    title="Выйти из аккаунта"
                  >
                    🚪
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ===== Онлайн ===== */}
          {nonFriends.length > 0 && (
            <div className="players-section">
              <div className="friends-header">Онлайн ({nonFriends.length})</div>
              <div className="players-section-scroll">
                {nonFriends.map(p => {
                  const isSelf = p.userId === myId;
                  const pid = `p-${p.id}`;
                  return (
                    <div
                      className={`player-item ${isPressing(pid) ? 'player-item--pressing' : ''}`}
                      key={p.id}
                      onTouchStart={(e) => !isSelf && startPress(pid, e, () => openMenuForPlayer(p))}
                      onTouchMove={movePress}
                      onTouchEnd={endPress}
                      onTouchCancel={endPress}
                      onMouseDown={(e) => !isSelf && startPress(pid, e, () => openMenuForPlayer(p))}
                      onMouseMove={movePress}
                      onMouseUp={endPress}
                      onMouseLeave={endPress}
                    >
                      {renderAvatar(p.nickname, p.avatarUrl)}
                      <span className="player-name">
                        {p.nickname}
                        <small className="player-stats">W:{p.wins} L:{p.losses}</small>
                      </span>
                      {!isSelf && (
                        <div className="player-actions">
                          {isAdmin && (
                            <>
                              <button
                                className="player-action-btn"
                                onClick={(e) => { e.stopPropagation(); onWatchChat(p.userId); }}
                                title="Просмотр чата"
                              >
                                ℹ️
                              </button>
                              <button
                                className="player-action-btn player-action-btn--danger"
                                onClick={(e) => { e.stopPropagation(); onBanConfirm(p.userId, p.nickname); }}
                                title="Забанить навсегда"
                              >
                                ⛔
                              </button>
                            </>
                          )}
                          <button
                            className="player-action-btn"
                            onClick={(e) => { e.stopPropagation(); onRequestDuel(p.userId); }}
                            title="Вызвать на дуэль"
                          >
                            ⚔️
                          </button>
                          <button
                            className={`player-action-btn ${unreadByUser[p.userId] ? 'player-action-btn--unread' : ''}`}
                            onClick={(e) => { e.stopPropagation(); onOpenPrivateChat(p.userId, p.nickname); }}
                            title="Написать"
                          >
                            ✉️
                          </button>
                          <button
                            className="player-action-btn"
                            onClick={(e) => { e.stopPropagation(); onFriendRequest(p.userId); }}
                            title="Добавить в друзья"
                          >
                            🤝
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== Друзья ===== */}
          {filteredFriends.length > 0 && (
            <div className="players-section">
              <div className="friends-header">Друзья ({filteredFriends.length})</div>
              <div className="players-section-scroll">
                {filteredFriends.map(f => {
                  const pid = `f-${f.userId}`;
                  return (
                    <div
                      className={`player-item ${isPressing(pid) ? 'player-item--pressing' : ''}`}
                      key={f.userId}
                      onTouchStart={(e) => startPress(pid, e, () => openMenuForFriend(f))}
                      onTouchMove={movePress}
                      onTouchEnd={endPress}
                      onTouchCancel={endPress}
                      onMouseDown={(e) => startPress(pid, e, () => openMenuForFriend(f))}
                      onMouseMove={movePress}
                      onMouseUp={endPress}
                      onMouseLeave={endPress}
                    >
                      {renderAvatar(f.nickname, f.avatarUrl)}
                      <span className="player-name">
                        {f.nickname}
                        {isFriendOnline(f.userId) && <span className="online-status" title="В сети" />}
                      </span>
                      <div className="player-actions">
                        <button
                          className={`player-action-btn ${unreadByUser[f.userId] ? 'player-action-btn--unread' : ''}`}
                          onClick={(e) => { e.stopPropagation(); onOpenPrivateChat(f.userId, f.nickname); }}
                          title="Написать"
                        >
                          ✉️
                        </button>
                        <button
                          className="player-action-btn"
                          onClick={(e) => { e.stopPropagation(); onRequestDuel(f.userId); }}
                          title="Вызвать на дуэль"
                        >
                          ⚔️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== Запросы ===== */}
          {friendRequests.length > 0 && (
            <div className="players-section players-section--requests">
              <div className="friends-header">Входящие запросы ({friendRequests.length})</div>
              <div className="players-section-scroll">
                {friendRequests.map(req => (
                  <div className="friend-request-item" key={req.requestId}>
                    <span>{req.senderNickname} хочет добавить вас в друзья</span>
                    <div className="friend-request-actions">
                      <button className="btn" onClick={() => onAcceptRequest(req.requestId)}>Принять</button>
                      <button className="btn" onClick={() => onDeclineRequest(req.requestId)}>Отклонить</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {onOpenInfo && (
            <button
              type="button"
              className="players-info-link"
              onClick={onOpenInfo}
            >
              О приложении
            </button>
          )}
        </div>
      </div>

      <StickerMenu
        open={!!menuTarget}
        title={menuTarget?.title}
        subtitle={menuTarget?.subtitle}
        items={menuTarget?.items || []}
        onClose={() => setMenuTarget(null)}
      />
    </>
  );
});

PlayersPanel.displayName = 'PlayersPanel';

export default memo(PlayersPanel);