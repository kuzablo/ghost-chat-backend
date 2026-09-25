import { useState, useEffect, useRef } from 'react';
import { getAvatarColor, getInitial } from '../utils';

/*
  [2.33.3] rejectCount — цвет нити тускнеет с числом отказов.
           Подпись reject: «X отклонил(а) запрос».
  [2.33.2] Переходы фаз — через useEffect по текущей phase.
  [2.33.0] Ритуал дружбы. Огонь и вода.
*/

const PHASE_DURATIONS = {
  appear: 500,
  pull: 700,
  accept: 550,
  merge: 900,
  reject: 900,
  timeout: 900,
  done: 250,
};

const WAIT_TIMEOUT_MS = 90 * 1000;

// [2.33.3] смешивание двух hex-цветов
function mixHex(a, b, t) {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const na = parseInt(pa, 16);
  const nb = parseInt(pb, 16);
  const ar = (na >> 16) & 0xff, ag = (na >> 8) & 0xff, ab = na & 0xff;
  const br = (nb >> 16) & 0xff, bg = (nb >> 8) & 0xff, bb = nb & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

const FriendshipRitual = ({
  open,
  initiatorId,
  initiatorNick,
  initiatorAvatar,
  targetId,
  targetNick,
  targetAvatar,
  myId,
  phase: incomingPhase = 'appear',
  rejectCount = 0,
  onAccept,
  onDecline,
  onCancel,
  onDone,
}) => {
  const [phase, setPhase] = useState(incomingPhase);
  const waitTimeoutRef = useRef(null);

  const isInitiator = myId === initiatorId;
  const isTarget = myId === targetId;

  useEffect(() => {
    if (!open) return;
    setPhase(incomingPhase);
  }, [open, incomingPhase]);

  useEffect(() => {
    if (!open) return;
    let timer = null;

    if (phase === 'appear') {
      timer = setTimeout(() => setPhase('wait'), PHASE_DURATIONS.appear);
    } else if (phase === 'pull') {
      timer = setTimeout(() => setPhase('wait'), PHASE_DURATIONS.pull);
    } else if (phase === 'accept') {
      timer = setTimeout(() => setPhase('merge'), PHASE_DURATIONS.accept);
    } else if (phase === 'merge') {
      timer = setTimeout(() => setPhase('done'), PHASE_DURATIONS.merge);
    } else if (phase === 'reject') {
      timer = setTimeout(() => setPhase('done'), PHASE_DURATIONS.reject);
    } else if (phase === 'timeout') {
      timer = setTimeout(() => setPhase('done'), PHASE_DURATIONS.timeout);
    }

    return () => { if (timer) clearTimeout(timer); };
  }, [open, phase]);

  useEffect(() => {
    if (!open) return;
    if (phase !== 'wait') return;
    if (!isInitiator) return;

    if (waitTimeoutRef.current) clearTimeout(waitTimeoutRef.current);
    waitTimeoutRef.current = setTimeout(() => {
      waitTimeoutRef.current = null;
      setPhase('timeout');
    }, WAIT_TIMEOUT_MS);

    return () => {
      if (waitTimeoutRef.current) {
        clearTimeout(waitTimeoutRef.current);
        waitTimeoutRef.current = null;
      }
    };
  }, [open, phase, isInitiator]);

  useEffect(() => {
    if (!open) return;
    if (phase !== 'done') return;
    const t = setTimeout(() => onDone && onDone(), PHASE_DURATIONS.done);
    return () => clearTimeout(t);
  }, [phase, open, onDone]);

  if (!open) return null;

  const showButtons = phase === 'wait' && isTarget;
  const showCancel = phase === 'wait' && isInitiator;
  const showClose = phase === 'wait' && !isInitiator && !isTarget;

  // [2.33.3] цвет нити: холоднее с каждым отказом
  const t = Math.min(rejectCount / 5, 1);
  const fireColor = mixHex('#FF7A45', '#7A8A9A', t);
  const waterColor = mixHex('#3BB5E8', '#7A8A9A', t);
  const gradId = `fr-thread-grad-${rejectCount}`;

  const renderOrbContent = (nick, avatar) => (
    <div
      className="fr-orb-inner"
      style={avatar
        ? {
            backgroundImage: `url(${avatar})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : { background: getAvatarColor(nick) }
      }
    >
      {!avatar && getInitial(nick)}
    </div>
  );

  return (
    <div className={`fr-overlay fr-overlay--${phase}`} role="dialog" aria-modal="true">
      <div className="fr-stage">

        <div className={`fr-orb fr-orb--fire fr-orb--${phase}`}>
          <div className="fr-orb-halo" />
          {renderOrbContent(initiatorNick, initiatorAvatar)}
          <div className="fr-orb-nick">{initiatorNick}</div>
        </div>

        <svg
          className={`fr-thread fr-thread--${phase}`}
          viewBox="0 0 320 120"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={fireColor} stopOpacity="0.9" />
              <stop offset="100%" stopColor={waterColor} stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <path
            className="fr-thread-path"
            d="M 20 60 C 100 15, 220 105, 300 60"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <div className={`fr-orb fr-orb--water fr-orb--${phase}`}>
          <div className="fr-orb-halo" />
          {renderOrbContent(targetNick, targetAvatar)}
          <div className="fr-orb-nick">{targetNick}</div>
        </div>

        {phase === 'merge' && <div className="fr-flash" />}
      </div>

      <div className="fr-caption">
        {phase === 'pull' && isInitiator && 'Нить тянется…'}
        {phase === 'appear' && isTarget && `${initiatorNick} тянется к тебе`}
        {phase === 'wait' && isInitiator && `Ждём ответа ${targetNick}`}
        {phase === 'wait' && isTarget && `${initiatorNick} предлагает дружбу`}
        {phase === 'accept' && 'Согласие…'}
        {phase === 'merge' && 'Теперь вы — одно'}
        {phase === 'reject' && isInitiator && `${targetNick} отклонил(а) запрос`}
        {phase === 'reject' && !isInitiator && 'Нить растворилась'}
        {phase === 'timeout' && 'Ответа не было'}
      </div>

      {showButtons && (
        <div className="fr-actions">
          <button
            type="button"
            className="fr-btn fr-btn--accept"
            onClick={onAccept}
          >
            Принять
          </button>
          <button
            type="button"
            className="fr-btn fr-btn--decline"
            onClick={onDecline}
          >
            Отклонить
          </button>
        </div>
      )}

      {showCancel && (
        <div className="fr-actions">
          <button
            type="button"
            className="fr-btn fr-btn--decline"
            onClick={() => {
              if (onCancel) onCancel();
              else if (onDone) onDone();
            }}
          >
            Отменить запрос
          </button>
        </div>
      )}

      {showClose && (
        <button
          type="button"
          className="fr-skip"
          onClick={onDone}
          aria-label="Закрыть"
          title="Закрыть"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default FriendshipRitual;