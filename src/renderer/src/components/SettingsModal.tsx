import React, { useState } from 'react'
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react'

interface Library {
    id: string
    name: string
}

interface Props {
    libraries: Library[]
    onClose: () => void
    onSave: (libs: Library[]) => void
}

export const SettingsModal: React.FC<Props> = ({ libraries, onClose, onSave }) => {
    const [localLibs, setLocalLibs] = useState<Library[]>([...libraries])
    const [newLibName, setNewLibName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')

    const handleAdd = () => {
        if (!newLibName.trim()) return
        const newLib = {
            id: Date.now().toString(),
            name: newLibName.trim()
        }
        setLocalLibs([...localLibs, newLib])
        setNewLibName('')
    }

    const handleDelete = (id: string) => {
        if (id === 'default') {
            alert('No puedes eliminar la biblioteca principal.')
            return
        }
        if (confirm('¿Eliminar esta biblioteca? Los libros no se borrarán pero quedarán "huérfanos" hasta que los muevas.')) {
            setLocalLibs(localLibs.filter(l => l.id !== id))
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
                    <h2>Configuración de Bibliotecas</h2>
                    <button className="close-btn" onClick={onClose}><X size={24} /></button>
                </header>

                <div className="modal-body">
                    <div className="settings-section">
                        <h3>Tus Bibliotecas</h3>
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
                                                    <button className="icon-btn danger" onClick={() => handleDelete(lib.id)}><Trash2 size={16} /></button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="add-library">
                            <input
                                placeholder="Nombre de nueva biblioteca..."
                                value={newLibName}
                                onChange={e => setNewLibName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            />
                            <button className="add-btn" onClick={handleAdd}>
                                <Plus size={18} /> Agregar
                            </button>
                        </div>
                    </div>
                </div>

                <footer className="modal-footer">
                    <button className="cancel-footer-btn" onClick={onClose}>Cancelar</button>
                    <button className="save-footer-btn" onClick={() => onSave(localLibs)}>Guardar Cambios</button>
                </footer>
            </div>
        </div>
    )
}
