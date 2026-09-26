import { useState, useEffect, useRef, memo } from 'react';
import { getAvatarColor, getInitial } from '../utils';

/*
  [2.45.0] Аватар с маскот-плейсхолдером.
  - нет src           → буква на градиенте (как было)
  - src + грузится    → маскот-плейсхолдер внутри круга
  - src + загрузилось → фото проявляется плавно
  - src + ошибка      → буква на градиенте

  Обёртка принимает любой существующий className (msg-avatar,
  player-avatar, dialog-avatar, profile-avatar, private-chat-avatar,
  pm-orbit-avatar, forward-picker-avatar). Никаких стилей не меняет —
  просто вкладывает нужные слои внутрь.
*/

const Avatar = memo(({
  src,
  nickname,
  className = '',
  style = null,
  onClick = null,
  alt = '',
  children = null,
  ...rest
}) => {
  const [status, setStatus] = useState(src ? 'loading' : 'letter');
  const imgRef = useRef(null);

  useEffect(() => {
    if (!src) { setStatus('letter'); return; }
    setStatus('loading');
  }, [src]);

  // Страховка: если картинка уже в кэше, onLoad может не сработать
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !src) return;
    if (img.complete) {
      if (img.naturalWidth > 0) setStatus('loaded');
      else setStatus('letter');
    }
  }, [src]);

  const bgStyle =
    (status === 'letter' || !src)
      ? { background: getAvatarColor(nickname) }
      : null;

  return (
    <div
      className={`${className} avatar-host`.trim()}
      style={{ ...(bgStyle || {}), ...(style || {}) }}
      onClick={onClick || undefined}
      {...rest}
    >
      {status === 'loading' && (
        <span className="avatar-mascot-fill" aria-hidden="true" />
      )}

      {status === 'letter' && (
        <span className="avatar-letter" aria-hidden="true">
          {getInitial(nickname)}
        </span>
      )}

      {src && (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className="avatar-img"
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('letter')}
          style={{ opacity: status === 'loaded' ? 1 : 0 }}
        />
      )}

      {children}
    </div>
  );
});

export default Avatar;