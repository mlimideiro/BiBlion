import React, { useState, useEffect } from 'react'
import { User, UserPlus, LogOut, Shield, Edit2, Trash2, Save, Settings, RefreshCw, Terminal, Image as ImageIcon, ExternalLink, Maximize2 } from 'lucide-react'
import { dataService } from '../services/dataService'

interface AdminDashboardProps {
    onLogout: () => void
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
    const [users, setUsers] = useState<any[]>([])
    const [newUserUser, setNewUserUser] = useState('')
    const [newUserPass, setNewUserPass] = useState('')
    const [msg, setMsg] = useState('')
    const [error, setError] = useState('')
    const [activeTab, setActiveTab] = useState<'users' | 'utils' | 'shared'>('users')
    const [syncLogs, setSyncLogs] = useState<string[]>([])
    const [isSyncing, setIsSyncing] = useState(false)
    const [isOptimizing, setIsOptimizing] = useState(false)
    const [sharedCovers, setSharedCovers] = useState<any[]>([])
    const [loadingShared, setLoadingShared] = useState(false)

    useEffect(() => {
        loadUsers()
        if (activeTab === 'shared') loadSharedCovers()
    }, [activeTab])

    const loadUsers = async () => {
        try {
            if ((window as any).electron) {
                const usersList = await (window as any).electron.getUsers()
                setUsers(usersList)
            } else {
                const response = await fetch(`${window.location.origin}/api/users`)
                const usersList = await response.json()
                setUsers(usersList)
            }
        } catch (err) {
            console.error(err)
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setMsg('')
        setError('')
        if (!newUserUser || !newUserPass) return
        try {
            let result: any
            if ((window as any).electron) {
                result = await (window as any).electron.createUser({
                    username: newUserUser,
                    password: newUserPass
                })
            } else {
                const response = await fetch(`${window.location.origin}/api/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: newUserUser, password: newUserPass })
                })
                result = await response.json()
            }
            if (result.success) {
                setMsg(`Usuario "${newUserUser}" creado correctamente.`)
                setNewUserUser('')
                setNewUserPass('')
                loadUsers()
            } else {
                setError(result.error || 'Error al crear usuario')
            }
        } catch (err) {
            setError('Error de conexión')
        }
    }

    const handleDeleteUser = async (username: string) => {
        if (!confirm(`¿Estás seguro de eliminar al usuario "${username}"? Se borrarán todos sus datos.`)) return
        try {
            let result: any
            if ((window as any).electron) {
                result = await (window as any).electron.deleteUser({ username })
            } else {
                const response = await fetch(`${window.location.origin}/api/users/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username })
                })
                result = await response.json()
            }
            if (result.success) {
                loadUsers()
            } else {
                alert(result.error || 'Error al eliminar')
            }
        } catch (e) {
            alert('Error al conectar')
        }
    }

    const [editingUser, setEditingUser] = useState<string | null>(null)
    const [editPassword, setEditPassword] = useState('')

    const handleUpdateUser = async () => {
        if (!editingUser || !editPassword) return
        try {
            let result: any
            const payload = { username: editingUser, password: editPassword }
            if ((window as any).electron) {
                result = await (window as any).electron.updateUser(payload)
            } else {
                const response = await fetch(`${window.location.origin}/api/users/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })
                result = await response.json()
            }
            if (result.success) {
                setEditingUser(null)
                setEditPassword('')
                alert('Contraseña actualizada')
            } else {
                alert(result.error || 'Error al actualizar')
            }
        } catch (e) {
            alert('Error al conectar')
        }
    }

    const handleStartSync = async () => {
        setSyncLogs(['Iniciando proceso de sincronización...'])
        setIsSyncing(true)
        try {
            await dataService.syncCovers((chunk) => {
                setSyncLogs(prev => {
                    const lines = chunk.split('\n').filter(l => l.trim())
                    return [...prev, ...lines]
                })
            })
        } catch (e: any) {
            setSyncLogs(prev => [...prev, `[ERROR FATAL] ${e.message}`])
        } finally {
            setIsSyncing(false)
        }
    }

    const handleStartOptimize = async () => {
        setSyncLogs(['Iniciando proceso de optimización global...'])
        setIsOptimizing(true)
        try {
            await dataService.optimizeGlobalImages((chunk) => {
                setSyncLogs(prev => {
                    const lines = chunk.split('\n').filter(l => l.trim())
                    return [...prev, ...lines]
                })
            })
            loadSharedCovers()
        } catch (e: any) {
            setSyncLogs(prev => [...prev, `[ERROR FATAL] ${e.message}`])
        } finally {
            setIsOptimizing(false)
        }
    }

    const loadSharedCovers = async () => {
        setLoadingShared(true)
        try {
            const list = await dataService.getSharedCovers()
            setSharedCovers(list)
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingShared(false)
        }
    }

    const [editingShared, setEditingShared] = useState<any | null>(null)
    const [newSharedUrl, setNewSharedUrl] = useState('')
    const [isDraggingShared, setIsDraggingShared] = useState(false)
    const dropRefShared = React.useRef<HTMLDivElement>(null)

    const processAndUploadSharedImage = async (file: File) => {
        if (!editingShared) return
        if (!file.type.startsWith('image/')) {
            alert('Por favor selecciona un archivo de imagen.')
            return
        }

        const reader = new FileReader()
        reader.onload = (e) => {
            const img = new Image()
            img.onload = async () => {
                const canvas = document.createElement('canvas')
                const MAX_WIDTH = 400
                const scale = Math.min(1, MAX_WIDTH / img.width)
                canvas.width = img.width * scale
                canvas.height = img.height * scale

                const ctx = canvas.getContext('2d')
                if (!ctx) return
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

                const base64 = canvas.toDataURL('image/jpeg', 0.7)
                const success = await dataService.updateSharedCover(editingShared.filename, { imageData: base64 })

                if (success) {
                    alert('Imagen compartida actualizada correctamente')
                    setEditingShared(null)
                    loadSharedCovers()
                } else {
                    alert('Error al actualizar la imagen.')
                }
            }
            img.src = e.target?.result as string
        }
        reader.readAsDataURL(file)
    }

    const handleSharedDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDraggingShared(true)
    }

    const handleSharedDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDraggingShared(false)
    }

    const handleSharedDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDraggingShared(false)
        const file = e.dataTransfer.files[0]
        if (file) processAndUploadSharedImage(file)
    }

    const handleUpdateShared = async () => {
        if (!editingShared) return
        try {
            const success = await dataService.updateSharedCover(editingShared.filename, { url: newSharedUrl })
            if (success) {
                alert('Imagen compartida actualizada correctamente')
                setEditingShared(null)
                setNewSharedUrl('')
                loadSharedCovers()
            } else {
                alert('Error al actualizar')
            }
        } catch (e) {
            alert('Error de conexión')
        }
    }

    return (
        <div className="admin-container">
            <div className="admin-sidebar">
                <div className="admin-logo">
                    <Shield size={40} className="admin-icon-logo" />
                    <h2>SuperAdmin</h2>
                </div>
                
                <nav className="admin-nav">
                    <button 
                        className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
                        onClick={() => setActiveTab('users')}
                    >
                        <User size={18} /> Usuarios
                    </button>
                    <button 
                        className={`nav-item ${activeTab === 'utils' ? 'active' : ''}`}
                        onClick={() => setActiveTab('utils')}
                    >
                        <Settings size={18} /> Utilidades
                    </button>
                    <button 
                        className={`nav-item ${activeTab === 'shared' ? 'active' : ''}`}
                        onClick={() => setActiveTab('shared')}
                    >
                        <ImageIcon size={18} /> Banco Imágenes
                    </button>
                </nav>

                <button className="logout-btn" onClick={onLogout}>
                    <LogOut size={18} /> Cerrar Sesión
                </button>
            </div>

            <div className="admin-content">
                {activeTab === 'users' ? (
                    <>
                        <header>
                            <h1>Gestión de Usuarios</h1>
                            <p>Crea cuentas para que cada usuario tenga su propia biblioteca aislada.</p>
                        </header>

                        <div className="admin-grid">
                            <div className="admin-card create-user-card">
                                <h3><UserPlus size={20} /> Crear Nuevo Usuario</h3>
                                <form onSubmit={handleCreateUser}>
                                    <div className="form-group">
                                        <label>Usuario</label>
                                        <input
                                            type="text"
                                            value={newUserUser}
                                            onChange={e => setNewUserUser(e.target.value)}
                                            placeholder="Nombre de usuario"
                                            className="admin-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Contraseña</label>
                                        <input
                                            type="text"
                                            value={newUserPass}
                                            onChange={e => setNewUserPass(e.target.value)}
                                            placeholder="Contraseña"
                                            className="admin-input"
                                        />
                                    </div>
                                    {msg && <div className="success-msg">{msg}</div>}
                                    {error && <div className="error-msg">{error}</div>}
                                    <button className="create-btn" type="submit">Dar de Alta</button>
                                </form>
                            </div>

                            <div className="admin-card users-list-card">
                                <h3><User size={20} /> Usuarios Activos ({users.length})</h3>
                                <div className="users-list">
                                    {users.map((user) => (
                                        <div key={user.username} className="user-card-item">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div className="user-avatar-small">
                                                    <User size={16} />
                                                </div>
                                                <span>{user.username}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    className="icon-btn"
                                                    title="Cambiar contraseña"
                                                    onClick={() => { setEditingUser(user.username); setEditPassword(''); }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    className="icon-btn danger"
                                                    title="Eliminar usuario"
                                                    onClick={() => handleDeleteUser(user.username)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </>
                ) : activeTab === 'utils' ? (
                    <>
                        <header>
                            <h1>Utilidades de Sistema</h1>
                            <p>Herramientas avanzadas para mantenimiento y reparación de datos.</p>
                        </header>
                        
                        <div className="admin-grid" style={{ gridTemplateColumns: '1fr' }}>
                            <div className="admin-card sync-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '30px' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3><RefreshCw size={20} className={isSyncing ? 'spin-anim' : ''} /> Sincronización Tapas</h3>
                                        <p style={{ fontSize: '0.9rem', color: '#888', maxWidth: '600px', margin: '10px 0 0' }}>
                                            Normaliza portadas (descarga URLs y corrige ISBNs).
                                        </p>
                                    </div>
                                    <button 
                                        className="create-btn" 
                                        style={{ width: 'auto', padding: '12px 30px' }}
                                        onClick={handleStartSync}
                                        disabled={isSyncing || isOptimizing}
                                    >
                                        {isSyncing ? 'Sincronizando...' : 'Comenzar Sincronización'}
                                    </button>
                                </div>
                            </div>

                            <div className="admin-card sync-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '30px' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3><Maximize2 size={20} className={isOptimizing ? 'spin-anim' : ''} /> Optimizar Imágenes Globales</h3>
                                        <p style={{ fontSize: '0.9rem', color: '#888', maxWidth: '600px', margin: '10px 0 0' }}>
                                            Mueve portadas duplicadas a un banco compartido para ahorrar espacio.
                                        </p>
                                    </div>
                                    <button 
                                        className="create-btn" 
                                        style={{ width: 'auto', padding: '12px 30px' }}
                                        onClick={handleStartOptimize}
                                        disabled={isSyncing || isOptimizing}
                                    >
                                        {isOptimizing ? 'Optimizando...' : 'Comenzar Optimización'}
                                    </button>
                                </div>

                                {syncLogs.length > 0 && (
                                    <div className="log-console">
                                        <div className="log-header">
                                            <Terminal size={14} /> Consola de Salida
                                        </div>
                                        <div className="log-content">
                                            {syncLogs.map((log, i) => (
                                                <div key={i} className="log-line">{log}</div>
                                            ))}
                                            {(isSyncing || isOptimizing) && <div className="log-cursor">_</div>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <header>
                            <h1>Banco Global de Imágenes</h1>
                            <p>Gestiona las portadas compartidas que ahorran espacio en el servidor.</p>
                        </header>

                        <div className="shared-covers-grid">
                            {loadingShared ? (
                                <div className="empty-state">Cargando banco de imágenes...</div>
                            ) : sharedCovers.length === 0 ? (
                                <div className="empty-state">No hay imágenes en el banco global. Ejecuta la optimización primero.</div>
                            ) : (
                                sharedCovers.map(cover => (
                                    <div key={cover.filename} className="shared-cover-item">
                                        <div className="shared-cover-img">
                                            <img src={`/api/covers/shared/${cover.filename}`} alt={cover.filename} />
                                        </div>
                                        <div className="shared-cover-info">
                                            <div className="shared-isbn">{cover.filename.split('.')[0]}</div>
                                            <div className="shared-meta">{Math.round(cover.size / 1024)} KB</div>
                                            <button className="edit-shared-btn" onClick={() => setEditingShared(cover)}>
                                                <Edit2 size={14} /> Editar
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            {editingUser && (
                <div className="modal-overlay" onClick={() => setEditingUser(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', background: '#1e1e26', border: '1px solid rgba(255,255,255,0.1)', padding: '30px' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#fff' }}>Cambiar contraseña para <span style={{ color: '#a78bfa' }}>{editingUser}</span></h3>

                        <div className="form-group">
                            <label style={{ display: 'block', color: '#ccc', marginBottom: '8px', fontSize: '0.9rem' }}>Nueva Contraseña</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    className="admin-input"
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    placeholder="Ingresa la nueva clave"
                                    autoFocus
                                    style={{ width: '100%', padding: '12px', fontSize: '1rem' }}
                                />
                            </div>
                        </div>

                        <div className="modal-footer" style={{ marginTop: '25px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="action-btn secondary" onClick={() => setEditingUser(null)} style={{ padding: '10px 15px', background: 'transparent', border: '1px solid #444', color: '#ccc' }}>
                                Cancelar
                            </button>
                            <button className="action-btn" onClick={handleUpdateUser} style={{ padding: '10px 20px', background: '#a78bfa', color: '#000', fontWeight: 'bold' }}>
                                <Save size={18} />
                                <span>Guardar</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingShared && (
                <div className="modal-overlay" onClick={() => setEditingShared(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', background: '#1e1e26', padding: '30px' }}>
                        <h3>Editar Portada Global</h3>
                        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '20px' }}>ISBN: {editingShared.filename.split('.')[0]}</p>
                        
                        <div className="form-group">
                            <label>Nueva URL de Imagen</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input 
                                    type="text" 
                                    className="admin-input" 
                                    value={newSharedUrl}
                                    onChange={e => setNewSharedUrl(e.target.value)}
                                    placeholder="https://..."
                                />
                                <button className="action-btn" onClick={handleUpdateShared} style={{ background: '#a78bfa', color: '#000', padding: '0 20px' }}>
                                    Ir
                                </button>
                            </div>
                        </div>

                        <div className="separator" style={{ margin: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center', height: '10px' }}>
                            <span style={{ background: '#1e1e26', padding: '0 10px', fontSize: '0.8rem', color: '#666' }}>O SUBE UN ARCHIVO</span>
                        </div>

                        <div 
                            className={`modal-cover-dropzone ${isDraggingShared ? 'dragging' : ''}`}
                            onDragOver={handleSharedDragOver}
                            onDragLeave={handleSharedDragLeave}
                            onDrop={handleSharedDrop}
                            onClick={() => {
                                const input = document.createElement('input')
                                input.type = 'file'
                                input.accept = 'image/*'
                                input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0]
                                    if (file) processAndUploadSharedImage(file)
                                }
                                input.click()
                            }}
                            style={{ padding: '30px', textAlign: 'center', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            <div style={{ color: '#aaa' }}>
                                <ImageIcon size={30} style={{ marginBottom: '10px', opacity: 0.5 }} />
                                <p style={{ margin: 0, fontSize: '0.9rem' }}>Arrastra una foto o haz clic para subir</p>
                            </div>
                        </div>

                        <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '25px' }}>
                            <button className="action-btn secondary" onClick={() => setEditingShared(null)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .admin-container {
                    display: flex;
                    height: 100vh;
                    background: #0f0f13;
                    color: white;
                    font-family: 'Inter', sans-serif;
                }
                .admin-sidebar {
                    width: 250px;
                    background: #181820;
                    padding: 30px;
                    display: flex;
                    flex-direction: column;
                    border-right: 1px solid rgba(255,255,255,0.05);
                }
                .admin-logo {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    margin-bottom: 50px;
                    color: #a78bfa;
                }
                .admin-logo h2 {
                    margin: 0;
                    font-size: 1.2rem;
                }
                .logout-btn {
                    margin-top: auto;
                    background: rgba(255, 100, 100, 0.1);
                    color: #ff6b6b;
                    border: none;
                    padding: 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: all 0.2s;
                }
                .logout-btn:hover {
                    background: rgba(255, 100, 100, 0.2);
                }
                .admin-content {
                    flex: 1;
                    padding: 40px 60px;
                    overflow-y: auto;
                }
                .admin-content header {
                    margin-bottom: 40px;
                }
                .admin-content h1 {
                    font-size: 2rem;
                    margin: 0 0 10px 0;
                }
                .admin-content p {
                    color: #aaa;
                    margin: 0;
                }
                .admin-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 30px;
                    max-width: 1200px;
                }
                .admin-card {
                    background: #1e1e26;
                    border-radius: 16px;
                    padding: 40px;
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .admin-card h3 {
                    margin-top: 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 25px;
                    color: #ddd;
                }
                .form-group {
                    margin-bottom: 20px;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 8px;
                    color: #aaa;
                    font-size: 0.9rem;
                }
                .admin-input {
                    width: 100%;
                    background: #252530;
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 12px 15px;
                    border-radius: 8px;
                    color: white;
                    outline: none;
                    box-sizing: border-box;
                }
                .admin-input:focus {
                    border-color: #a78bfa;
                }
                .create-btn {
                    width: 100%;
                    background: #a78bfa;
                    color: black;
                    border: none;
                    padding: 12px;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    margin-top: 10px;
                }
                .create-btn:hover {
                    background: #bca6ff;
                }
                .users-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .user-card-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px;
                    background: rgba(255,255,255,0.03);
                    border-radius: 10px;
                }
                .user-avatar-small {
                    width: 32px;
                    height: 32px;
                    background: #a78bfa;
                    color: black;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .icon-btn {
                    background: rgba(255,255,255,0.05);
                    border: none;
                    color: #aaa;
                    padding: 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .icon-btn:hover {
                    background: rgba(255,255,255,0.1);
                    color: white;
                }
                .icon-btn.danger:hover {
                    background: rgba(255, 50, 50, 0.2);
                    color: #ff6b6b;
                }
                .success-msg {
                    color: #4ade80;
                    margin-bottom: 15px;
                    padding: 10px;
                    background: rgba(74, 222, 128, 0.1);
                    border-radius: 6px;
                }
                .error-msg {
                    color: #f87171;
                    margin-bottom: 15px;
                    padding: 10px;
                    background: rgba(248, 113, 113, 0.1);
                    border-radius: 6px;
                }
                .admin-nav {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-bottom: 30px;
                }
                .nav-item {
                    background: transparent;
                    border: none;
                    color: #aaa;
                    padding: 12px 15px;
                    border-radius: 10px;
                    text-align: left;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 0.95rem;
                    transition: all 0.2s;
                }
                .nav-item:hover {
                    background: rgba(255,255,255,0.05);
                    color: white;
                }
                .nav-item.active {
                    background: rgba(167, 139, 250, 0.15);
                    color: #a78bfa;
                    font-weight: 600;
                }
                .log-console {
                    background: #000;
                    border-radius: 12px;
                    border: 1px solid #333;
                    margin-top: 20px;
                    overflow: hidden;
                }
                .log-header {
                    background: #111;
                    padding: 8px 15px;
                    font-size: 0.75rem;
                    color: #666;
                    border-bottom: 1px solid #222;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .log-content {
                    padding: 15px;
                    height: 300px;
                    overflow-y: auto;
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-size: 0.85rem;
                    color: #00ff00;
                    background: #050505;
                }
                .log-line {
                    margin-bottom: 4px;
                    white-space: pre-wrap;
                }
                .log-cursor {
                    display: inline-block;
                    animation: blink 1s step-end infinite;
                }
                @keyframes blink {
                    50% { opacity: 0; }
                }
                .spin-anim {
                    animation: spin 2s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .modal-content {
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                }
                .shared-covers-grid {
                    display: grid;
                    grid-template-columns: repeat(6, 1fr);
                    gap: 30px;
                    max-width: 1200px;
                }
                @media (max-width: 1400px) {
                    .shared-covers-grid {
                        grid-template-columns: repeat(4, 1fr);
                    }
                }
                @media (max-width: 1100px) {
                    .shared-covers-grid {
                        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                    }
                }
                .shared-cover-item {
                    background: #1e1e26;
                    border-radius: 12px;
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.05);
                    transition: transform 0.2s;
                }
                .shared-cover-item:hover {
                    transform: translateY(-5px);
                    border-color: rgba(167, 139, 250, 0.3);
                }
                .shared-cover-img {
                    height: 250px;
                    background: #000;
                }
                .shared-cover-img img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .shared-cover-info {
                    padding: 12px;
                }
                .shared-isbn {
                    font-size: 0.8rem;
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                .shared-meta {
                    font-size: 0.75rem;
                    color: #888;
                    margin-bottom: 10px;
                }
                .edit-shared-btn {
                    width: 100%;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #aaa;
                    padding: 6px;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }
                .edit-shared-btn:hover {
                    background: #a78bfa;
                    color: #000;
                }
                .action-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .action-btn.secondary {
                    background: transparent;
                    color: #aaa;
                    border: 1px solid #444;
                }
                .modal-cover-dropzone.dragging {
                    background: rgba(167, 139, 250, 0.1);
                    border-color: #a78bfa !important;
                }
            `}</style>
        </div>
    )
}
