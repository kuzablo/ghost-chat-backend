import { useState, useRef, useEffect, useMemo } from 'react';
import SmartImage from './SmartImage';

/*
  [2.46.0] Двухшаговая панель: экран «Избранные» (по умолчанию) и «Все стикеры».
           - При открытии — всегда «Избранные».
           - Если избранных нет — уведомление и кнопка «Все стикеры».
           - Если есть — сетка избранных + кнопка «Все стикеры».
           - На экране всех — кнопка «←» к избранным.
  [2.41.0] Долгое нажатие: 500мс → в избранное, 1000мс на избранном → убрать.
  [2.40.1] Свайп по сетке для пагинации.
  [2.40.0] Пагинация 12 на страницу.
  [2.35.16] Панель стикеров.
*/
const API_URL = 'https://api.banjoboy420.ru';
const MAX_STICKER_MB = 10;
const MAX_STICKER_BYTES = MAX_STICKER_MB * 1024 * 1024;
const PAGE_SIZE = 12;

const SWIPE_THRESHOLD = 60;
const SWIPE_MAX_DRAG = 60;
const SWIPE_DIRECTION_LOCK = 8;

const LONG_PRESS_ADD_MS = 500;
const LONG_PRESS_REMOVE_MS = 1000;
const LONG_PRESS_CANCEL_PX = 8;

const StickerPanel = ({
  open,
  onClose,
  stickers,
  onPick,
  isAdmin,
  token,
  onUploaded,
  favoriteStickers = [],
  onToggleFavorite,
}) => {
  const [view, setView] = useState('favorites'); // 'favorites' | 'all'
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [page, setPage] = useState(0);
  const fileRef = useRef(null);
  const gridRef = useRef(null);

  const favoriteSet = useMemo(
    () => new Set(Array.isArray(favoriteStickers) ? favoriteStickers : []),
    [favoriteStickers]
  );

  // [2.46.0] При каждом открытии — стартуем с «Избранные».
  useEffect(() => {
    if (open) {
      setView('favorites');
      setPage(0);
      setError('');
    }
  }, [open]);

  // [2.41.0] Сортировка: сначала избранные (в порядке массива — новые
  // первыми), потом остальные в исходном порядке бэка.
  const sortedStickers = useMemo(() => {
    if (!Array.isArray(stickers)) return [];
    const favs = [];
    const rest = [];
    const favOrder = new Map();
    (favoriteStickers || []).forEach((u, i) => favOrder.set(u, i));

    stickers.forEach(s => {
      if (favoriteSet.has(s.url)) favs.push(s);
      else rest.push(s);
    });

    favs.sort((a, b) => {
      const ai = favOrder.has(a.url) ? favOrder.get(a.url) : Infinity;
      const bi = favOrder.has(b.url) ? favOrder.get(b.url) : Infinity;
      return ai - bi;
    });

    return [...favs, ...rest];
  }, [stickers, favoriteStickers, favoriteSet]);

  // Список только избранных для view 'favorites'
  const favoriteStickersList = useMemo(() => {
    if (!Array.isArray(stickers)) return [];
    const favOrder = new Map();
    (favoriteStickers || []).forEach((u, i) => favOrder.set(u, i));

    return stickers
      .filter(s => favoriteSet.has(s.url))
      .sort((a, b) => {
        const ai = favOrder.has(a.url) ? favOrder.get(a.url) : Infinity;
        const bi = favOrder.has(b.url) ? favOrder.get(b.url) : Infinity;
        return ai - bi;
      });
  }, [stickers, favoriteStickers, favoriteSet]);

  const totalPages = Math.max(1, Math.ceil(sortedStickers.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  useEffect(() => {
    const el = gridRef.current;
    if (el) el.scrollTop = 0;
  }, [page]);

  const visibleStickers = useMemo(() => {
    const start = page * PAGE_SIZE;
    return sortedStickers.slice(start, start + PAGE_SIZE);
  }, [sortedStickers, page]);

  // [2.41.0] Тост — 2.4с.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // [2.40.1] Свайп по сетке. Только на view 'all'.
  useEffect(() => {
    if (!open) return;
    if (view !== 'all') return;
    const el = gridRef.current;
    if (!el) return;
    if (totalPages <= 1) return;

    const state = { active: false, startX: 0, startY: 0, direction: null, lastDx: 0 };

    const reset = () => {
      state.active = false;
      state.direction = null;
      state.lastDx = 0;
      if (el) {
        el.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = 'translate3d(0,0,0)';
        setTimeout(() => { if (el) el.style.transition = ''; }, 260);
      }
    };

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      state.active = true;
      state.startX = t.clientX;
      state.startY = t.clientY;
      state.direction = null;
      state.lastDx = 0;
      el.style.transition = 'none';
    };

    const onTouchMove = (e) => {
      if (!state.active) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;

      if (!state.direction) {
        if (Math.abs(dx) < SWIPE_DIRECTION_LOCK && Math.abs(dy) < SWIPE_DIRECTION_LOCK) return;
        state.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      if (state.direction !== 'horizontal') return;

      const atStart = page === 0 && dx > 0;
      const atEnd = page === totalPages - 1 && dx < 0;
      let off = dx;
      if (atStart || atEnd) off = dx * 0.25;
      off = Math.max(-SWIPE_MAX_DRAG, Math.min(SWIPE_MAX_DRAG, off));

      state.lastDx = off;
      el.style.transform = `translate3d(${off}px, 0, 0)`;
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!state.active) return;
      if (state.direction !== 'horizontal') { reset(); return; }
      const off = state.lastDx;
      if (off <= -SWIPE_THRESHOLD && page < totalPages - 1) {
        setPage((p) => Math.min(totalPages - 1, p + 1));
      } else if (off >= SWIPE_THRESHOLD && page > 0) {
        setPage((p) => Math.max(0, p - 1));
      }
      reset();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [open, view, page, totalPages]);

  if (!open) return null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type !== 'image/gif') {
      setError('Только GIF');
      setTimeout(() => setError(''), 3000);
      return;
    }
    if (file.size > MAX_STICKER_BYTES) {
      setError(`Файл больше ${MAX_STICKER_MB} МБ`);
      setTimeout(() => setError(''), 3000);
      return;
    }

    setUploading(true);
    setError('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('token', token);
      const res = await fetch(`${API_URL}/api/upload-sticker`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (onUploaded) onUploaded(data.stickers || []);
    } catch (err) {
      setError('Не удалось: ' + (err?.message || ''));
      setTimeout(() => setError(''), 4000);
    } finally {
      setUploading(false);
    }
  };

  const handlePick = (url) => {
    if (onPick) onPick(url);
  };

  const handleToggleFavorite = (url, isFav) => {
    if (onToggleFavorite) onToggleFavorite(url);
    setToast(isFav ? 'больше не нравится' : 'добавлено в избранные');
  };

  const handlePrev = (e) => {
    e.stopPropagation();
    setPage((p) => Math.max(0, p - 1));
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setPage((p) => Math.min(totalPages - 1, p + 1));
  };

  const showPager = totalPages > 1;
  const isFavoritesView = view === 'favorites';
  const isAllView = view === 'all';

  return (
    <>
      <div className="sticker-panel-overlay" onClick={onClose} />
      <div className="sticker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sticker-panel-header">
          {isAllView && (
            <button
              type="button"
              className="sticker-panel-back"
              onClick={() => setView('favorites')}
              aria-label="К избранным"
              title="К избранным"
            >
              ←
            </button>
          )}

          <span className="sticker-panel-title">
            {isFavoritesView ? '⭐ Избранные' : 'Стикеры'}
          </span>

          {isAdmin && (
            <button
              type="button"
              className="sticker-panel-upload"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title={`Загрузить GIF (до ${MAX_STICKER_MB} МБ)`}
            >
              {uploading ? '⏳' : '＋'}
            </button>
          )}

          <button
            type="button"
            className="sticker-panel-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>

          {isAdmin && (
            <input
              ref={fileRef}
              type="file"
              accept="image/gif"
              style={{ display: 'none' }}
              onChange={handleUpload}
            />
          )}
        </div>

        {error && <div className="sticker-panel-error">{error}</div>}

        {isFavoritesView ? (
          <>
            {favoriteStickersList.length === 0 ? (
              <div className="sticker-fav-empty">
                <div className="sticker-fav-empty-mascot" aria-hidden="true" />
                <div className="sticker-fav-empty-title">Пока никого</div>
                <div className="sticker-fav-empty-text">
                  Долгое нажатие на стикер в ленте или в панели — добавит
                  его в избранные. Здесь появятся те, что тебе нравятся.
                </div>
              </div>
            ) : (
              <div className="sticker-panel-grid-wrap">
                <div className="sticker-panel-grid sticker-panel-grid--fav">
                  {favoriteStickersList.map((s) => (
                    <StickerTile
                      key={s.id}
                      sticker={s}
                      isFav={true}
                      onPick={handlePick}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              className="sticker-fav-all-btn"
              onClick={() => setView('all')}
            >
              <span className="sticker-fav-all-btn-icon" aria-hidden="true">🎨</span>
              <span className="sticker-fav-all-btn-text">Все стикеры</span>
              <span className="sticker-fav-all-btn-arrow" aria-hidden="true">→</span>
            </button>
          </>
        ) : (
          <>
            {stickers.length === 0 ? (
              <div className="sticker-panel-empty">
                {isAdmin
                  ? 'Ты пока не загрузил ни одной гифки. Жми ＋'
                  : 'Тишина. Скоро здесь что-то появится.'}
              </div>
            ) : (
              <>
                <div className="sticker-panel-grid-wrap">
                  <div className="sticker-panel-grid" ref={gridRef}>
                    {visibleStickers.map((s) => {
                      const isFav = favoriteSet.has(s.url);
                      return (
                        <StickerTile
                          key={s.id}
                          sticker={s}
                          isFav={isFav}
                          onPick={handlePick}
                          onToggleFavorite={handleToggleFavorite}
                        />
                      );
                    })}
                  </div>
                </div>

                {showPager && (
                  <div className="sticker-panel-pager">
                    <button
                      type="button"
                      className="sticker-panel-pager-btn"
                      onClick={handlePrev}
                      disabled={page === 0}
                      aria-label="Предыдущая страница"
                    >
                      ‹
                    </button>
                    <span className="sticker-panel-pager-counter">
                      {page + 1} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="sticker-panel-pager-btn"
                      onClick={handleNext}
                      disabled={page === totalPages - 1}
                      aria-label="Следующая страница"
                    >
                      ›
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {toast && (
          <div className="duel-notice sticker-panel-toast">
            {toast}
          </div>
        )}
      </div>
    </>
  );
};

// [2.41.0] Плитка стикера с long-press логикой.
const StickerTile = ({ sticker, isFav, onPick, onToggleFavorite }) => {
  const timerRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);
  const movedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleDown = (e) => {
    const t = e.touches ? e.touches[0] : e;
    startPosRef.current = { x: t.clientX, y: t.clientY };
    firedRef.current = false;
    movedRef.current = false;
    cancelPress();

    const delay = isFav ? LONG_PRESS_REMOVE_MS : LONG_PRESS_ADD_MS;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      onToggleFavorite(sticker.url, isFav);
    }, delay);
  };

  const handleMove = (e) => {
    if (!timerRef.current) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = Math.abs(t.clientX - startPosRef.current.x);
    const dy = Math.abs(t.clientY - startPosRef.current.y);
    if (dx > LONG_PRESS_CANCEL_PX || dy > LONG_PRESS_CANCEL_PX) {
      movedRef.current = true;
      cancelPress();
    }
  };

  const handleUp = () => {
    cancelPress();
    if (firedRef.current || movedRef.current) {
      firedRef.current = false;
      movedRef.current = false;
      return;
    }
    onPick(sticker.url);
  };

  const handleCancel = () => {
    cancelPress();
    firedRef.current = false;
    movedRef.current = false;
  };

  return (
    <button
      type="button"
      className={
        'sticker-panel-tile' +
        (isFav ? ' sticker-panel-tile--fav' : '')
      }
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleCancel}
      onPointerLeave={handleCancel}
      onContextMenu={(e) => e.preventDefault()}
      title={isFav ? 'Отправить · удержание 1с — убрать' : 'Отправить · удержание — в избранное'}
    >
      <SmartImage
        src={sticker.url}
        alt=""
        wrapperClassName="sticker-panel-tile-smart"
        fit="contain"
      />
      {isFav && (
        <span className="sticker-panel-tile-fav-marker" aria-hidden="true">
          ⭐
        </span>
      )}
    </button>
  );
};

export default StickerPanel;