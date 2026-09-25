import { useState, useEffect, useRef } from 'react';
import '../../styles/Chat.smart-image.css';

/*
  [2.44.0] Обёртка над <img> с дружелюбным плейсхолдером.
           Пока изображение грузится — показывает маскота.
           Когда загрузилось — плавно проявляет фото.
           Если ошибка — мягкую заглушку, не пропадает.

  Применяется для фото без фиксированного размера (лента, личка).
  Не применяется там, где контейнер уже имеет заданный aspect
  (стикеры, видео): там layout не съезжает.

  children рендерятся ПЕРЕД <img> — для absolute-элементов (overlay,
  reactions) порядок в DOM не важен, а replyBlock, если есть,
  должен быть сверху.
*/

const SmartImage = ({
  src,
  alt = '',
  wrapperClassName = '',
  wrapperStyle = null,
  wrapperProps = null,
  imgClassName = '',
  imgStyle = null,
  onClick = null,
  draggable = false,
  fit = 'contain',
  children = null,
}) => {
  const [status, setStatus] = useState('loading'); // loading | loaded | error
  const imgRef = useRef(null);

  // При смене src — снова в loading
  useEffect(() => {
    setStatus('loading');
  }, [src]);

  // Страховка: если картинка уже в кэше, onLoad может не сработать.
  // img.complete=true при монтировании — сразу фиксируем результат.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete) {
      if (img.naturalWidth > 0) setStatus('loaded');
      else setStatus('error');
    }
  }, [src]);

  if (!src) return null;

  return (
    <div
      className={`smart-image smart-image--${status} ${wrapperClassName}`.trim()}
      style={wrapperStyle || undefined}
      {...(wrapperProps || {})}
    >
      {children}

      <div
        className={`smart-image-ph ${status !== 'loading' ? 'smart-image-ph--hidden' : ''}`}
        aria-hidden="true"
      >
        <div className="smart-image-ph-mascot" />
      </div>

      {status === 'error' && (
        <div className="smart-image-ph smart-image-ph--error" aria-hidden="true">
          <span className="smart-image-ph-icon">🖼️</span>
          <span className="smart-image-ph-text">Не загрузилось</span>
        </div>
      )}

      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={draggable}
        className={`smart-image-img ${imgClassName}`.trim()}
        style={{
          objectFit: fit,
          opacity: status === 'loaded' ? 1 : 0,
          transition: 'opacity 0.28s ease',
          ...(imgStyle || {}),
        }}
        onClick={onClick || undefined}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  );
};

export default SmartImage;