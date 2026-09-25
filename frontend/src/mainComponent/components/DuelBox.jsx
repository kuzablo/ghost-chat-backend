import React from 'react';

const DuelBox = ({
  duelInvite,
  duelState,
  duelNotice,
  onAcceptDuel,
  onDeclineDuel,
  onChoose,
  onCloseDuelNotice,
}) => {
  return (
    <>
      {duelNotice && (
        <div className="duel-notice" onClick={onCloseDuelNotice}>
          {duelNotice}
        </div>
      )}

      {duelInvite && (
        <div className="duel-box">
          <p>{duelInvite.fromNick} вызывает вас!</p>
          <div className="duel-actions">
            <button className="btn" onClick={onAcceptDuel}>Принять</button>
            <button className="btn" onClick={onDeclineDuel}>Отклонить</button>
          </div>
        </div>
      )}

      {duelState && !duelState.result && (
        <div className="duel-box">
          <p>Дуэль против {duelState.opponentNick}. Твой выбор:</p>
          <div className="duel-actions">
            <button
              className={`btn ${duelState.myChoice === 'rock' ? 'selected' : ''}`}
              onClick={() => onChoose('rock')}
            >
              Камень
            </button>
            <button
              className={`btn ${duelState.myChoice === 'scissors' ? 'selected' : ''}`}
              onClick={() => onChoose('scissors')}
            >
              Ножницы
            </button>
            <button
              className={`btn ${duelState.myChoice === 'paper' ? 'selected' : ''}`}
              onClick={() => onChoose('paper')}
            >
              Бумага
            </button>
          </div>
        </div>
      )}

      {duelState?.result && (
        <div className="duel-box">
          {duelState.result === 'win' && '🏆 Победа!'}
          {duelState.result === 'lose' && '💀 Поражение'}
          {duelState.result === 'draw' && '🤝 Ничья'}
        </div>
      )}
    </>
  );
};

export default DuelBox;