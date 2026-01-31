import React, { useState, useEffect } from 'react'
import { User, UserPlus, LogOut, Shield, Edit2, Trash2, X, Save } from 'lucide-react'

interface AdminDashboardProps {
    onLogout: () => void
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
    const [users, setUsers] = useState<any[]>([])
    const [newUserUser, setNewUserUser] = useState('')
    const [newUserPass, setNewUserPass] = useState('')
    const [msg, setMsg] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        loadUsers()
    }, [])

    const loadUsers = async () => {
        try {
            if ((window as any).electron) {
                const usersList = await (window as any).electron.getUsers()
                setUsers(usersList)
            } else {
                // Fetch from API
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
                // Call API
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

    return (
        <div className="admin-container">
            <div className="admin-sidebar">
                <div className="admin-logo">
                    <Shield size={40} className="admin-icon-logo" />
                    <h2>SuperAdmin</h2>
                </div>
                <button className="logout-btn" onClick={onLogout}>
                    <LogOut size={18} /> Cerrar Sesión
                </button>
            </div>

            <div className="admin-content">
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
                            {users.map((user, i) => (
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

                {editingUser && (
                    <div className="modal-overlay" onClick={() => setEditingUser(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                            <h3>Cambiar contraseña para {editingUser}</h3>
                            <div className="input-group">
                                <label>Nueva Contraseña</label>
                                <input
                                    type="text"
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    placeholder="Ingresa la nueva clave"
                                />
                            </div>
                            <div className="modal-footer" style={{ marginTop: '20px' }}>
                                <button className="action-btn" onClick={handleUpdateUser}>
                                    <Save size={16} />
                                    <span>Guardar</span>
                                </button>
                                <button className="action-btn secondary" onClick={() => setEditingUser(null)}>
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
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
                }
                .admin-card {
                    background: #1e1e26;
                    border-radius: 16px;
                    padding: 30px;
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
                .user-item {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    padding: 12px;
                    background: rgba(255,255,255,0.03);
                    border-radius: 10px;
                }
                .user-avatar {
                    width: 36px;
                    height: 36px;
                    background: #a78bfa;
                    color: black;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
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
            `}</style>
        </div>
    )
}
