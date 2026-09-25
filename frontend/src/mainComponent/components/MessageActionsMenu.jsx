import { useEffect, useRef } from 'react';

/*
  [2.46.0] Новый пункт «В избранное» / «Убрать из избранного» для стикеров.
           Включается, если передан stickerUrl и onToggleFavorite.
  [2.35.59] edit-кнопка скрывается, если onEdit не передан.
  [2.35.45] Меню действий над сообщением — только иконки, без карточки.
*/
const MENU_GAP = 10;
const MENU_SIZE = 44;

const MessageActionsMenu = ({
  open,
  anchor,
  container,
  isOwn,
  isAdmin,
  isSticker,
  stickerUrl = null,
  isFavorite = false,
  onForward,
  onEdit,
  onDelete,
  onToggleFavorite,
  onSaveToStorage,
  isInStorage = false,
  onClose,
}) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, onClose]);

  if (!open || !anchor || !container) return null;

  const items = [];
  items.push({ id: 'forward', icon: '↪', label: 'Переслать', onClick: onForward });

  if (onSaveToStorage) {
    items.push({
      id: 'storage',
      icon: isInStorage ? '✓' : '🗄️',
      label: isInStorage ? 'Уже в хранилище' : 'В хранилище',
      onClick: isInStorage ? undefined : onSaveToStorage,
    });
  }

  if (stickerUrl && onToggleFavorite) {
    items.push({
      id: 'favorite',
      icon: isFavorite ? '⭐' : '☆',
      label: isFavorite ? 'Убрать из избранного' : 'В избранное',
      onClick: onToggleFavorite,
    });
  }

  if (isOwn && !isSticker && onEdit) {
    items.push({ id: 'edit', icon: '✏️', label: 'Редактировать', onClick: onEdit });
  }
  if ((isOwn || isAdmin) && onDelete) {
    items.push({ id: 'delete', icon: '🗑️', label: 'Удалить', onClick: onDelete, danger: true });
  }

  const total = items.length * MENU_SIZE + (items.length - 1) * MENU_GAP;

  const containerTop = container.top;
  const containerBottom = container.bottom;
  const spaceAbove = anchor.top - containerTop;
  const spaceBelow = containerBottom - anchor.bottom;

  let top;
  if (spaceAbove >= MENU_SIZE + 8) {
    top = anchor.top - MENU_SIZE - 6;
  } else if (spaceBelow >= MENU_SIZE + 8) {
    top = anchor.bottom + 6;
  } else {
    top = Math.max(containerTop + 4, anchor.top - MENU_SIZE - 6);
  }

  let left = anchor.left + anchor.width / 2 - total / 2;
  left = Math.max(container.left + 8, Math.min(left, container.right - total - 8));

  return (
    <div
      ref={ref}
      className="msg-actions-menu"
      style={{ top, left, width: total }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`msg-actions-menu-btn${it.danger ? ' msg-actions-menu-btn--danger' : ''}`}
          onClick={() => {
            onClose();
            it.onClick?.();
          }}
          aria-label={it.label}
          title={it.label}
        >
          <span className="msg-actions-menu-icon">{it.icon}</span>
        </button>
      ))}
    </div>
  );
};

export default MessageActionsMenu;