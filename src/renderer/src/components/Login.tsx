import React, { useState } from 'react'
import { Lock, User } from 'lucide-react'
import logo from '../assets/logo.png'

interface LoginProps {
    onLogin: (username: string) => void
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const isElectron = !!(window as any).electron
            let data: any

            if (isElectron) {
                data = await (window as any).electron.login({ username, password })
            } else {
                const API_BASE = `${window.location.origin}/api`
                const response = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                })
                data = await response.json()
            }

            if (data.success) {
                localStorage.setItem('biblion_user', data.username)
                onLogin(data.username)
            } else {
                setError(data.error || 'Credenciales inválidas')
            }
        } catch (err) {
            setError('Error al conectar con el servidor')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-logo">
                        <img src={logo} alt="BiBlion" />
                    </div>
                    <h1>BiBlion</h1>
                    <p>Ingresa tus credenciales</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label><User size={16} /> Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Tu nombre de usuario"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label><Lock size={16} /> Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <div className="login-error">{error}</div>}

                    <button type="submit" className="login-btn" disabled={loading}>
                        {loading ? 'Ingresando...' : 'Entrar'}
                    </button>
                </form>
            </div>

            <style>{`
                .login-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    background: linear-gradient(135deg, #1e1e2e 0%, #11111b 100%);
                    font-family: 'Inter', system-ui, sans-serif;
                    padding: 20px;
                }
                .login-card {
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 24px;
                    padding: 40px;
                    width: 100%;
                    max-width: 400px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                }
                .login-header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .login-logo {
                    width: 110px;
                    height: 110px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 2px solid #8b7ba8;
                    border-radius: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
                    overflow: hidden;
                }
                .login-logo img {
                    width: 90px;
                    height: 90px;
                    object-fit: contain;
                }
                .login-header h1 {
                    color: white;
                    margin: 0;
                    font-size: 28px;
                    font-weight: 800;
                }
                .login-header p {
                    color: #a6adc8;
                    margin-top: 5px;
                }
                .form-group {
                    margin-bottom: 20px;
                }
                .form-group label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #cdd6f4;
                    margin-bottom: 8px;
                    font-size: 14px;
                }
                .form-group input {
                    width: 100%;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    padding: 12px 15px;
                    color: white;
                    font-size: 16px;
                    transition: all 0.2s;
                    box-sizing: border-box;
                }
                .form-group input:focus {
                    outline: none;
                    border-color: #8b7ba8;
                    background: rgba(255,255,255,0.05);
                }
                .login-btn {
                    width: 100%;
                    background: #8b7ba8;
                    color: white;
                    border: none;
                    border-radius: 12px;
                    padding: 14px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    margin-top: 10px;
                }
                .login-btn:hover {
                    background: #7a6a97;
                    transform: translateY(-2px);
                }
                .login-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .login-error {
                    background: rgba(243, 139, 168, 0.1);
                    color: #f38ba8;
                    padding: 12px;
                    border-radius: 10px;
                    font-size: 14px;
                    margin-bottom: 20px;
                    text-align: center;
                    border: 1px solid rgba(243, 139, 168, 0.2);
                }
            `}</style>
        </div>
    )
}
