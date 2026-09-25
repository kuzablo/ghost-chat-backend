import { useState, useRef, useEffect, useCallback } from 'react';
import StorageTile from './StorageTile';

/*
  [2.47.7] itemsByIdRef — синхронно при каждом рендере. sortedItems
           читает Map во время рендера, а не после useEffect. Без
           этого на первом проходе Map пуста → пустой список.
  [2.47.6] Dragndrop с touch events — браузер не отменяет жест.
*/

const LONG_PRESS_MS = 400;
const MOVE_CANCEL_PX = 10;
const EDGE_SCROLL_ZONE = 70;
const EDGE_SCROLL_SPEED = 10;

const StorageGrid = ({ items, onDelete, onReorder }) => {
  const [draggingId, setDraggingId] = useState(null);
  const [ghost, setGhost] = useState(null);
  const [orderPreview, setOrderPreview] = useState(null);

  const gridRef = useRef(null);
  const itemsByIdRef = useRef(new Map());
  const currentOrderRef = useRef([]);
  const onReorderRef = useRef(onReorder);

  const stateRef = useRef({
    active: false,
    timer: null,
    startX: 0, startY: 0, lastX: 0, lastY: 0,
    offsetX: 0, offsetY: 0,
    item: null,
    originalOrder: [],
    orderPreview: null,
    scrollEl: null,
    autoScrollRaf: null,
  });

  // [2.47.7] Синхронно, до чтения в рендере.
  itemsByIdRef.current = new Map(items.map(i => [i.id, i]));

  useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);

  const currentOrder = orderPreview || items.map(i => i.id);
  useEffect(() => { currentOrderRef.current = currentOrder; }, [currentOrder]);

  const sortedItems = currentOrder
    .map(id => itemsByIdRef.current.get(id))
    .filter(Boolean);

  const stopAutoScroll = useCallback(() => {
    const d = stateRef.current;
    if (d.autoScrollRaf) {
      cancelAnimationFrame(d.autoScrollRaf);
      d.autoScrollRaf = null;
    }
  }, []);

  const autoScrollTick = useCallback(() => {
    const d = stateRef.current;
    if (!d.active || !d.scrollEl) return;
    const rect = d.scrollEl.getBoundingClientRect();
    if (d.lastY < rect.top + EDGE_SCROLL_ZONE) {
      d.scrollEl.scrollTop -= EDGE_SCROLL_SPEED;
    } else if (d.lastY > rect.bottom - EDGE_SCROLL_ZONE) {
      d.scrollEl.scrollTop += EDGE_SCROLL_SPEED;
    }
    d.autoScrollRaf = requestAnimationFrame(autoScrollTick);
  }, []);

  const updatePreview = (clientX, clientY) => {
    const d = stateRef.current;
    const grid = gridRef.current;
    if (!grid || !d.item) return;

    const tiles = grid.querySelectorAll('[data-storage-tile-id]');
    let targetIdx = -1;
    tiles.forEach((el, idx) => {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right &&
          clientY >= r.top && clientY <= r.bottom) {
        targetIdx = idx;
      }
    });
    if (targetIdx < 0) return;

    const preview = d.orderPreview || currentOrderRef.current;
    const fromIdx = preview.indexOf(d.item.id);
    if (fromIdx === -1 || fromIdx === targetIdx) return;

    const next = preview.slice();
    next.splice(fromIdx, 1);
    next.splice(targetIdx, 0, d.item.id);
    d.orderPreview = next;
    setOrderPreview(next);
  };

  const startDrag = (clientX, clientY, tileEl) => {
    const d = stateRef.current;
    const id = tileEl.dataset.storageTileId;
    const item = itemsByIdRef.current.get(id);
    if (!item) return;

    const rect = tileEl.getBoundingClientRect();
    const scrollEl = tileEl.closest('.storage-body');

    d.active = true;
    d.item = item;
    d.offsetX = clientX - rect.left;
    d.offsetY = clientY - rect.top;
    d.originalOrder = currentOrderRef.current.slice();
    d.orderPreview = currentOrderRef.current.slice();
    d.scrollEl = scrollEl;

    setDraggingId(id);
    setGhost({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      item,
    });

    if (navigator.vibrate) { try { navigator.vibrate(10); } catch { /* noop */ } }
    d.autoScrollRaf = requestAnimationFrame(autoScrollTick);
  };

  const finishDrag = (commit) => {
    const d = stateRef.current;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    if (d.active && commit && d.orderPreview) {
      const before = d.originalOrder.join('|');
      const after = d.orderPreview.join('|');
      if (before !== after && onReorderRef.current) onReorderRef.current(d.orderPreview);
    }
    stopAutoScroll();
    d.active = false;
    d.item = null;
    d.orderPreview = null;
    d.originalOrder = [];
    setDraggingId(null);
    setGhost(null);
    setOrderPreview(null);
  };

  // ===== Touch =====
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const target = e.target;
      if (target.closest('button')) return;
      if (target.closest('.storage-tile-voice')) return;
      const tileEl = target.closest('[data-storage-tile-id]');
      if (!tileEl) return;

      const d = stateRef.current;
      const t = e.touches[0];
      d.startX = t.clientX;
      d.startY = t.clientY;
      d.lastX = t.clientX;
      d.lastY = t.clientY;

      if (d.timer) clearTimeout(d.timer);
      d.timer = setTimeout(() => {
        d.timer = null;
        startDrag(t.clientX, t.clientY, tileEl);
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e) => {
      const d = stateRef.current;

      if (!d.active) {
        if (!d.timer) return;
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - d.startX);
        const dy = Math.abs(t.clientY - d.startY);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
          clearTimeout(d.timer);
          d.timer = null;
        }
        return;
      }

      if (e.cancelable) e.preventDefault();
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      d.lastX = t.clientX;
      d.lastY = t.clientY;
      setGhost(g => g ? { ...g, left: t.clientX - d.offsetX, top: t.clientY - d.offsetY } : g);
      updatePreview(t.clientX, t.clientY);
    };

    const onTouchEnd = () => {
      const d = stateRef.current;
      if (d.timer) { clearTimeout(d.timer); d.timer = null; }
      if (d.active) finishDrag(true);
    };

    const onTouchCancel = () => {
      const d = stateRef.current;
      if (d.timer) { clearTimeout(d.timer); d.timer = null; }
      if (d.active) finishDrag(false);
    };

    grid.addEventListener('touchstart', onTouchStart, { passive: false });
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    grid.addEventListener('touchend', onTouchEnd);
    grid.addEventListener('touchcancel', onTouchCancel);

    return () => {
      grid.removeEventListener('touchstart', onTouchStart);
      grid.removeEventListener('touchmove', onTouchMove);
      grid.removeEventListener('touchend', onTouchEnd);
      grid.removeEventListener('touchcancel', onTouchCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Mouse =====
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest('button')) return;
    if (target.closest('.storage-tile-voice')) return;
    const tileEl = target.closest('[data-storage-tile-id]');
    if (!tileEl) return;

    const d = stateRef.current;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;

    if (d.timer) clearTimeout(d.timer);
    d.timer = setTimeout(() => {
      d.timer = null;
      startDrag(e.clientX, e.clientY, tileEl);
    }, LONG_PRESS_MS);
  };

  useEffect(() => {
    if (!draggingId) return;

    const onMove = (e) => {
      const d = stateRef.current;
      if (!d.active) return;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      setGhost(g => g ? { ...g, left: e.clientX - d.offsetX, top: e.clientY - d.offsetY } : g);
      updatePreview(e.clientX, e.clientY);
    };
    const onUp = () => finishDrag(true);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId]);

  useEffect(() => () => {
    const d = stateRef.current;
    if (d.timer) clearTimeout(d.timer);
    stopAutoScroll();
  }, [stopAutoScroll]);

  return (
    <>
      <div
        ref={gridRef}
        className={`storage-grid${draggingId ? ' storage-grid--dragging' : ''}`}
        onMouseDown={onMouseDown}
        onContextMenu={(e) => { if (stateRef.current.active) e.preventDefault(); }}
      >
        {sortedItems.map(item => (
          <div
            key={item.id}
            data-storage-tile-id={item.id}
            className={`storage-grid-item${draggingId === item.id ? ' storage-grid-item--dragging' : ''}`}
          >
            <StorageTile item={item} onDelete={onDelete} />
          </div>
        ))}
      </div>

      {ghost && (
        <div
          className="storage-grid-ghost"
          style={{
            left: ghost.left,
            top: ghost.top,
            width: ghost.width,
            height: ghost.height,
          }}
          aria-hidden="true"
        >
          <StorageTile item={ghost.item} onDelete={() => {}} />
        </div>
      )}
    </>
  );
};

export default StorageGrid;