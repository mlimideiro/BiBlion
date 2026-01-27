import React, { useState } from 'react'
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react'

interface Library {
    id: string
    name: string
}

interface Props {
    libraries: Library[]
    tags: string[]
    onClose: () => void
    onSave: (libs: Library[], tags: string[]) => void
}

export const SettingsModal: React.FC<Props> = ({ libraries, tags, onClose, onSave }) => {
    const [localLibs, setLocalLibs] = useState<Library[]>([...libraries])
    const [localTags, setLocalTags] = useState<string[]>([...tags])
    const [newLibName, setNewLibName] = useState('')
    const [newTagName, setNewTagName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')

    const handleAddLib = () => {
        if (!newLibName.trim()) return
        const newLib = {
            id: Date.now().toString(),
            name: newLibName.trim()
        }
        setLocalLibs([...localLibs, newLib])
        setNewLibName('')
    }

    const handleAddTag = () => {
        if (!newTagName.trim()) return
        if (localTags.includes(newTagName.trim())) {
            alert('Esta etiqueta ya existe.')
            return
        }
        setLocalTags([...localTags, newTagName.trim()])
        setNewTagName('')
    }

    const handleDeleteLib = (id: string) => {
        if (id === 'default') {
            alert('No puedes eliminar la biblioteca principal.')
            return
        }
        if (confirm('¿Eliminar esta biblioteca? Los libros no se borrarán pero quedarán "huérfanos" hasta que los muevas.')) {
            setLocalLibs(localLibs.filter(l => l.id !== id))
        }
    }

    const handleDeleteTag = (tagName: string) => {
        if (confirm(`¿Eliminar la etiqueta "${tagName}"? Se quitará de todos los libros que la tengan.`)) {
            setLocalTags(localTags.filter(t => t !== tagName))
        }
    }

    const startEdit = (lib: Library) => {
        setEditingId(lib.id)
        setEditName(lib.name)
    }

    const saveEdit = () => {
        setLocalLibs(localLibs.map(l => l.id === editingId ? { ...l, name: editName } : l))
        setEditingId(null)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
                <header className="modal-header">
                    <h2>Configuración</h2>
                    <button className="close-btn" onClick={onClose}><X size={24} /></button>
                </header>

                <div className="modal-body">
                    <div className="settings-section">
                        <h3>Bibliotecas</h3>
                        <div className="library-list">
                            {localLibs.map(lib => (
                                <div key={lib.id} className="library-item">
                                    {editingId === lib.id ? (
                                        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
                                            <input
                                                className="edit-input"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                            />
                                            <button className="icon-btn success" onClick={saveEdit}><Check size={18} /></button>
                                        </div>
                                    ) : (
                                        <>
                                            <span>{lib.name} {lib.id === 'default' && <small>(Principal)</small>}</span>
                                            <div className="item-actions">
                                                <button className="icon-btn" onClick={() => startEdit(lib)}><Edit2 size={16} /></button>
                                                {lib.id !== 'default' && (
                                                    <button className="icon-btn danger" onClick={() => handleDeleteLib(lib.id)}><Trash2 size={16} /></button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="add-item">
                            <input
                                placeholder="Nueva biblioteca..."
                                value={newLibName}
                                onChange={e => setNewLibName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddLib()}
                            />
                            <button className="add-btn" onClick={handleAddLib}>
                                <Plus size={18} /> Agregar
                            </button>
                        </div>
                    </div>

                    <div className="settings-section">
                        <h3>Etiquetas Globales</h3>
                        <div className="tags-manager-list" style={{ marginBottom: '15px' }}>
                            {localTags.map(tag => (
                                <div key={tag} className="tag-manager-item">
                                    <span className="tag-badge-ui">{tag}</span>
                                    <button className="icon-btn danger" onClick={() => handleDeleteTag(tag)}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="add-item">
                            <input
                                placeholder="Nueva etiqueta (ej: Favoritos)..."
                                value={newTagName}
                                onChange={e => setNewTagName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                            />
                            <button className="add-btn" onClick={handleAddTag}>
                                <Plus size={18} /> Agregar
                            </button>
                        </div>
                    </div>
                </div>

                <footer className="modal-footer">
                    <button className="cancel-footer-btn" onClick={onClose}>Cancelar</button>
                    <button className="save-footer-btn" onClick={() => onSave(localLibs, localTags)}>Guardar Cambios</button>
                </footer>
            </div>
        </div>
    )
}
