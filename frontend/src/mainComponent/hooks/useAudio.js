import { useEffect } from 'react';
import { ensureAudioContext, playNotificationSound, playSendSound } from '../utils';

/*
  [новый хук, рефакторинг 2.14.25]
  Вынесено из Chat.jsx:
    - эффект разблокировки AudioContext на первом user gesture;
    - обёртки playNotification / playSend, которые сначала гарантируют,
      что AudioContext инициализирован, потом играют звук.

  Зачем хук:
    Chat.jsx перестаёт знать про ensureAudioContext — он только вызывает
    audio.playNotification() / audio.playSend(). Если браузер ещё не дал
    user gesture — звук молча не сыграет, но не сломается.
*/
export const useAudio = () => {
  // Разблокировка AudioContext на первом клике/тапе.
  // Браузеры не дают создавать AudioContext до user gesture.
  useEffect(() => {
    const init = () => {
      ensureAudioContext();
      document.removeEventListener('click', init);
      document.removeEventListener('touchstart', init);
    };
    document.addEventListener('click', init);
    document.addEventListener('touchstart', init);
    return () => {
      document.removeEventListener('click', init);
      document.removeEventListener('touchstart', init);
    };
  }, []);

  // Обёртки: сами подстраховывают ensureAudioContext —
  // на случай, если первый клик был не туда, где стоял listener.
  const playNotification = () => {
    ensureAudioContext();
    playNotificationSound();
  };

  const playSend = () => {
    ensureAudioContext();
    playSendSound();
  };

  return { playNotification, playSend };
};