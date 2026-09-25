import { useEffect } from 'react';

/*
  [2.29.0] Поддержка item.badge — красный кружок с числом на кнопке.
  [2.20.1] Меню стикеров. Стиль 1-в-1 с капсульными кнопками.
*/
const StickerMenu = ({ open, title, subtitle, items, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sticker-menu-overlay" onClick={onClose}>
      <div className="sticker-menu" onClick={(e) => e.stopPropagation()}>
        {(title || subtitle) && (
          <div className="sticker-menu-header">
            {title && <div className="sticker-menu-title">{title}</div>}
            {subtitle && <div className="sticker-menu-subtitle">{subtitle}</div>}
          </div>
        )}
        <div className="sticker-menu-items">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              className={`sticker-menu-item ${item.danger ? 'sticker-menu-item--danger' : ''}`}
              style={{
                '--sticker-delay': `${i * 0.05}s`,
                '--sticker-rotate': `${i % 2 === 0 ? -3 : 3}deg`,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onClose();
                if (item.onClick) item.onClick();
              }}
              title={item.label}
            >
              <span className="sticker-menu-item-icon">{item.icon}</span>
              {item.badge ? (
                <span className="sticker-menu-item-badge">{item.badge}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StickerMenu;