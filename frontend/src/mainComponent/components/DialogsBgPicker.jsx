import { useState, useRef } from 'react';
import ConfirmModal from './ConfirmModal';

/*
  [2.36.3] Кнопка «Установить всем» — только у админа.
  [2.34.3] Пикер фона окна диалогов. 7 пресетов + загрузка + сброс.
*/
const MAX_BG_MB = 15;
const MAX_BG_BYTES = MAX_BG_MB * 1024 * 1024;
const API_URL = 'https://api.banjoboy420.ru';

const PRESETS = [
  { id: 'sunrise', name: 'Рассвет', css: 'linear-gradient(160deg, #FFB6C1 0%, #FFE4B5 60%, #FFF8DC 100%)' },
  { id: 'night',   name: 'Ночь',    css: 'linear-gradient(160deg, #0E1726 0%, #1E3A5F 60%, #2C3E5A 100%)' },
  { id: 'space',   name: 'Космос',  css: 'radial-gradient(circle at 30% 20%, #3a4a6a 0%, #1a1e2e 45%, #0a0c14 100%)' },
  { id: 'sakura',  name: 'Сакура',  css: 'linear-gradient(160deg, #FBC2EB 0%, #A6C1EE 100%)' },
  { id: 'sunset',  name: 'Закат',   css: 'linear-gradient(160deg, #FF7E5F 0%, #FEB47B 100%)' },
  { id: 'mint',    name: 'Мята',    css: 'linear-gradient(160deg, #B2E0D4 0%, #E0F5EE 100%)' },
  { id: 'paper',   name: 'Бумага',  css: 'linear-gradient(160deg, #F5F0E8 0%, #EDE4D3 100%)' },
];

export const PRESETS_MAP = PRESETS.reduce((acc, p) => {
  acc[p.id] = p.css;
  return acc;
}, {});

const DialogsBgPicker = ({
  current,
  onClose,
  onSave,
  token,
  isAdmin = false,
  onSetGlobalForAll,
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const fileRef = useRef(null);

  const currentPresetId = current && current.startsWith('preset:')
    ? current.slice('preset:'.length)
    : null;

  const handlePickPreset = (presetId) => {
    if (!onSave) return;
    onSave(`preset:${presetId}`);
    onClose();
  };

  const handleReset = () => {
    if (!onSave) return;
    onSave(null);
    onClose();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Только изображения');
      setTimeout(() => setError(''), 4000);
      return;
    }
    if (file.size > MAX_BG_BYTES) {
      setError(`Файл больше ${MAX_BG_MB} МБ`);
      setTimeout(() => setError(''), 4000);
      return;
    }

    setUploading(true);
    setError('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('token', token);

      const res = await fetch(`${API_URL}/api/upload-dialogs-bg`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      if (onSave) onSave(`url:${data.bgUrl}`);
      onClose();
    } catch (err) {
      console.error('Ошибка загрузки фона:', err);
      setError('Не удалось загрузить');
      setTimeout(() => setError(''), 4000);
    } finally {
      setUploading(false);
    }
  };

  const handleSetGlobalConfirm = () => {
    if (onSetGlobalForAll) onSetGlobalForAll(current || null);
    setConfirmGlobal(false);
  };

  return (
    <>
      <div className="dialogs-bg-overlay" onClick={onClose} />
      <div className="dialogs-bg-picker" onClick={(e) => e.stopPropagation()}>
        <div className="dialogs-bg-header">
          <h4>Фон окна</h4>
          <button
            type="button"
            className="dialogs-bg-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div className="dialogs-bg-section-label">Пресеты</div>
        <div className="dialogs-bg-presets">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              className={`dialogs-bg-tile ${currentPresetId === p.id ? 'active' : ''}`}
              style={{ background: p.css }}
              onClick={() => handlePickPreset(p.id)}
              title={p.name}
            >
              <span className="dialogs-bg-tile-name">{p.name}</span>
            </button>
          ))}
        </div>

        <div className="dialogs-bg-section-label">Своё</div>
        <div className="dialogs-bg-actions">
          <button
            type="button"
            className="dialogs-bg-upload"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '⏳ Загрузка…' : '📷 Загрузить свою'}
          </button>
          <input
            type="file"
            ref={fileRef}
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </div>

        <button
          type="button"
          className="dialogs-bg-reset"
          onClick={handleReset}
        >
          Сбросить фон
        </button>

        {isAdmin && onSetGlobalForAll && (
          <button
            type="button"
            className="dialogs-bg-global"
            onClick={() => setConfirmGlobal(true)}
          >
            ✨ Установить всем
          </button>
        )}

        {error && <div className="dialogs-bg-error">{error}</div>}
      </div>

      <ConfirmModal
        open={confirmGlobal}
        title="Установить этот фон всем?"
        description="Все пользователи без своего фона увидят его. Кто поставил свой — не тронем."
        confirmText="Установить"
        danger
        zIndex={1200}
        onConfirm={handleSetGlobalConfirm}
        onCancel={() => setConfirmGlobal(false)}
      />
    </>
  );
};

export default DialogsBgPicker;