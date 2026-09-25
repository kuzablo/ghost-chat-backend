import { useState } from 'react';
import { getAvatarColor, getInitial } from '../utils';
import Avatar from './Avatar';

/*
  [2.35.45] Модалка выбора получателя для пересылки.
            Общий чат + список друзей. Поиск по нику.
*/
const ForwardPickerModal = ({
  open,
  onClose,
  onPick,
  friends = [],
}) => {
  const [query, setQuery] = useState('');

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filteredFriends = q
    ? friends.filter(f => f.nickname.toLowerCase().includes(q))
    : friends;

  return (
    <>
      <div className="blur-overlay" onClick={onClose} />
      <div className="forward-picker" onClick={(e) => e.stopPropagation()}>
        <div className="forward-picker-header">
          <span className="forward-picker-title">Переслать</span>
          <button
            type="button"
            className="forward-picker-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <input
          className="forward-picker-search"
          type="text"
          placeholder="Поиск..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="forward-picker-list">
          <button
            type="button"
            className="forward-picker-item forward-picker-item--general"
            onClick={() => onPick({ type: 'general' })}
          >
            <div className="forward-picker-avatar forward-picker-avatar--general">
              💬
            </div>
            <span className="forward-picker-nick">В общий чат</span>
          </button>

          {filteredFriends.map(f => (
            <button
              key={f.userId}
              type="button"
              className="forward-picker-item"
              onClick={() => onPick({ type: 'private', userId: f.userId, nickname: f.nickname })}
            >
              <Avatar
                src={f.avatarUrl}
                nickname={f.nickname}
                className="forward-picker-avatar"
                alt=""
              />
              <span className="forward-picker-nick">{f.nickname}</span>
            </button>
          ))}

          {filteredFriends.length === 0 && q && (
            <div className="forward-picker-empty">Ничего не найдено</div>
          )}

          {!q && filteredFriends.length === 0 && (
            <div className="forward-picker-empty">
              Друзей пока нет
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ForwardPickerModal;