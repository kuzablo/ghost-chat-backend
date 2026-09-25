import { useState, useEffect } from 'react';

/*
  [2.35.0] Instagram-карточка для личных сообщений.
           oEmbed через наш бэк → превью + play → клик открывает оригинал.
*/

const API_URL = 'https://api.banjoboy420.ru';
const cache = new Map();

const IG_URL_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?/i;

export const extractInstagramUrl = (text) => {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(IG_URL_REGEX);
  return m ? m[0] : null;
};

const InstagramCard = ({ url }) => {
  const [data, setData] = useState(() => cache.get(url) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url) return;

    if (cache.has(url)) {
      setData(cache.get(url));
      setFailed(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/instagram-embed?url=${encodeURIComponent(url)}`
        );

        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }

        const payload = await res.json();
        if (cancelled) return;

        cache.set(url, payload);
        setData(payload);
        setFailed(false);
      } catch (err) {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  if (failed) {
    return (
      <a
        className="ig-card ig-card--fallback"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="ig-card-fallback-icon">📷</span>
        <span className="ig-card-fallback-text">Открыть в Instagram</span>
      </a>
    );
  }

  if (!data) {
    return (
      <div className="ig-card ig-card--loading" onClick={(e) => e.stopPropagation()}>
        <div className="ig-skeleton">
          <div className="ig-skeleton-shimmer" />
        </div>
      </div>
    );
  }

  return (
    <a
      className={`ig-card ${data.isVideo ? 'ig-card--video' : ''}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ig-card-media">
        <img
          className="ig-card-image"
          src={data.thumbnailUrl}
          alt=""
          loading="lazy"
          draggable={false}
        />

        {data.isVideo && (
          <span className="ig-card-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}

        <span className="ig-card-badge">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          <span>Instagram</span>
        </span>
      </div>

      {data.authorName && (
        <div className="ig-card-meta">
          <span className="ig-card-author">@{data.authorName}</span>
          {data.title && (
            <span className="ig-card-title" title={data.title}>
              {data.title}
            </span>
          )}
        </div>
      )}
    </a>
  );
};

export default InstagramCard;