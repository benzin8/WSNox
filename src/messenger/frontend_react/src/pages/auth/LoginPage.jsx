import { useState, useRef } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { parseApiError } from '../../utils/parseApiError';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function LoginPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const email = location.state?.email || '';

    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const isSubmitting = useRef(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting.current) return;
        isSubmitting.current = true;
        setLoading(true);
        setError('');

        try {
            const response = await axios.post(`${API_BASE}/auth/login`, {
                email,
                password,
            });

            const { access_token, refresh_token } = response.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);

            navigate('/chat');
        } catch (err) {
            if (err.response?.data?.detail === 'Email not verified') {
                navigate('/auth/send-code', { state: { email } });
                return;
            }
            setError(parseApiError(err, 'Login failed'));
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    if (!email) {
        return <Navigate to="/auth/send-code" replace />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">WSNox</h1>
                    <p className="mt-2 text-zinc-400">Введите ваш пароль для <strong>{email}</strong></p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Пароль</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-lime-400 p-4 font-bold text-zinc-900 hover:bg-lime-300 disabled:opacity-50 transition-all active:scale-[0.98]"
                    >
                        {loading ? 'Вход...' : 'Войти'}
                    </button>

                    <button
                        type="button"
                        onClick={() => navigate('/auth/send-code')}
                        className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Зайти под другим аккаунтом
                    </button>
                </form>
            </div>
        </div>
    );
}
