import { useEffect, useMemo, useState } from 'react';
import StorageGrid from './StorageGrid';
import StorageTile from './StorageTile';
import ConfirmModal from './ConfirmModal';
import '../../styles/Chat.storage.css';

/*
  [2.47.0] Панель хранилища. Сетка карточек, фильтр по типу, поиск.
  Красота и взаимодействие — этот шаг.
  Dragndrop — следующий.
*/

const TYPE_FILTERS = [
    { id: 'all', label: 'Всё', icon: '✦' },
    { id: 'text', label: 'Текст', icon: '📝' },
    { id: 'image', label: 'Фото', icon: '📷' },
    { id: 'sticker', label: 'Гифки', icon: '🎨' },
    { id: 'voice', label: 'Голос', icon: '🎤' },
    { id: 'video', label: 'Видео', icon: '📹' },
];

const plural = (n) => {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'запись';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'записи';
    return 'записей';
};

const StoragePanel = ({ open, onClose, items, isLoaded, error, onDelete, onReorder }) => {
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);

    useEffect(() => {
        if (!open) return;
        setFilter('all');
        setQuery('');
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    const filtered = useMemo(() => {
        let list = items;
        if (filter !== 'all') list = list.filter(i => i.type === filter);
        const q = query.trim().toLowerCase();
        if (q) {
            list = list.filter(i => {
                const text = (i.payload?.text || '').toLowerCase();
                const nick = (i.source?.nickname || '').toLowerCase();
                return text.includes(q) || nick.includes(q);
            });
        }
        return list;
    }, [items, filter, query]);

    const counts = useMemo(() => {
        const c = { all: items.length };
        items.forEach(i => { c[i.type] = (c[i.type] || 0) + 1; });
        return c;
    }, [items]);

    if (!open) return null;

    const handleDeleteAsk = (id) => setConfirmDelete({ id });
    const handleDeleteConfirm = () => {
        if (confirmDelete) {
            onDelete?.(confirmDelete.id);
            setConfirmDelete(null);
        }
    };

    return (
        <>
            <div className="storage-overlay" onClick={onClose} />
            <aside className="storage-panel">
                <header className="storage-header">
                    <div className="storage-brand">
                        <div className="storage-brand-mascot" aria-hidden="true" />
                        <div className="storage-brand-text">
                            <h2 className="storage-title">Хранилище</h2>
                            <div className="storage-sub">
                                {items.length} {plural(items.length)}
                            </div>
                        </div>
                    </div>
                    <button className="storage-close" onClick={onClose} aria-label="Закрыть">✕</button>
                </header>

                {error && <div className="storage-error">{error}</div>}

                {isLoaded && items.length > 0 && (
                    <>
                        <div className="storage-toolbar">
                            <div className="storage-chips">
                                {TYPE_FILTERS.map(f => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        className={`storage-chip ${filter === f.id ? 'storage-chip--active' : ''}`}
                                        onClick={() => setFilter(f.id)}
                                        disabled={f.id !== 'all' && !counts[f.id]}
                                    >
                                        <span className="storage-chip-icon" aria-hidden="true">{f.icon}</span>
                                        <span className="storage-chip-label">{f.label}</span>
                                        {counts[f.id] > 0 && <span className="storage-chip-count">{counts[f.id]}</span>}
                                    </button>
                                ))}
                            </div>

                            <input
                                type="text"
                                className="storage-search"
                                placeholder="Поиск по тексту и нику…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                spellCheck={false}
                                autoComplete="off"
                            />
                        </div>
                    </>
                )}

                <div className="storage-body">
                    {!isLoaded ? (
                        <div className="storage-loading">
                            <div className="storage-loading-mascot" />
                            <div className="storage-loading-text">Загружаем коллекцию…</div>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="storage-empty">
                            <div className="storage-empty-mascot" />
                            <div className="storage-empty-title">Здесь будет твоя коллекция</div>
                            <div className="storage-empty-text">
                                Сохраняй лучшее из чата — долгое нажатие на сообщение, потом <b>🗄️ В хранилище</b>.
                                Даже если сообщение удалят, копия останется здесь.
                            </div>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="storage-empty storage-empty--filtered">
                            <div className="storage-empty-title">Пусто в этом фильтре</div>
                            <div className="storage-empty-text">
                                Попробуй другой или сбрось поиск.
                            </div>
                        </div>
                    ) : filter !== 'all' || query.trim() ? (
                        <div className="storage-grid">
                            {filtered.map(item => (
                                <div key={item.id} className="storage-grid-item">
                                    <StorageTile item={item} onDelete={handleDeleteAsk} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <StorageGrid
                            items={filtered}
                            onDelete={handleDeleteAsk}
                            onReorder={onReorder}
                        />
                    )}
                </div>
            </aside>

            <ConfirmModal
                open={!!confirmDelete}
                title="Удалить из хранилища?"
                description="Запись исчезнет. Восстановить нельзя."
                confirmText="Удалить"
                danger
                zIndex={1800}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setConfirmDelete(null)}
            />
        </>
    );
};

export default StoragePanel;