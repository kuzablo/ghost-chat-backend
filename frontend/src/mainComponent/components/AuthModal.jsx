import React from 'react';
import Mascot from '../Mascot';

const AuthModal = ({
  isRegisterMode,
  setIsRegisterMode,
  authNickname,
  setAuthNickname,
  authPassword,
  setAuthPassword,
  showPassword,
  setShowPassword,
  authError,
  showIdleNotice,
  handleAuthSubmit,
}) => {
  return (
    <>
      <div className="blur-overlay" />
      <div className="auth-modal">
        <Mascot size={80} />
        <h3>{isRegisterMode ? 'ПИШИ НИКНЕЙМ' : 'ВХОД'}</h3>
        <input
          placeholder="Никнейм"
          value={authNickname}
          onChange={(e) => setAuthNickname(e.target.value)}
        />
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Пароль"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAuthSubmit()}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '18px',
              color: 'var(--nick-color)',
            }}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
        {authError && <div style={{ color: '#e94560', marginBottom: 8 }}>{authError}</div>}
        {showIdleNotice && (
          <div className={`idle-notice ${showIdleNotice ? 'visible' : ''}`}>
            ⏳ Неактивные пользователи будут автоматически отключены через 3 минуты бездействия.
          </div>
        )}
        {isRegisterMode && (
          <div style={{ fontSize: 12, color: 'var(--nick-color)', marginBottom: 8 }}>
            Пароль будет сохранён в зашифрованном виде, но восстановить его не получится. Придумай надёжный пароль: чем длиннее, тем лучше. Если забудешь — доступ к нику вернуть нельзя.
          </div>
        )}
        <button className="btn" onClick={handleAuthSubmit}>
          {isRegisterMode ? 'Зарегистрироваться' : 'Войти'}
        </button>
        <div className="auth-switch" onClick={() => setIsRegisterMode(!isRegisterMode)}>
          {isRegisterMode ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
        </div>
      </div>
    </>
  );
};

export default AuthModal;