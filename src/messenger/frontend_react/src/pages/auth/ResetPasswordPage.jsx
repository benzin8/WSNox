import { useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, Navigate, Link } from 'react-router-dom';
import axios from 'axios';
import { parseApiError } from '../../utils/parseApiError';
import PasswordStrengthBar from '../../components/auth/PasswordStrengthBar';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const isSubmitting = useRef(false);

    if (!token) {
        return <Navigate to="/auth/send-code" replace />;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting.current) return;
        if (password !== confirm) {
            setError('Пароли не совпадают');
            return;
        }
        if (password.length < 8) {
            setError('Минимум 8 символов');
            return;
        }
        isSubmitting.current = true;
        setLoading(true);
        setError('');
        try {
            const res = await axios.post(`${API_BASE}/auth/reset-password`, { token, password });
            const { access_token, refresh_token } = res.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            navigate('/chat');
        } catch (err) {
            setError(parseApiError(err, 'Не удалось сбросить пароль'));
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl animate-fadeIn">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">Новый пароль</h1>
                    <p className="mt-2 text-zinc-400">Придумайте пароль не короче 8 символов</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Новый пароль</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoFocus
                        />
                        <PasswordStrengthBar password={password} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Ещё раз</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
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
                        className="w-full rounded-xl bg-lime-400 p-4 font-bold text-zinc-900 hover:bg-lime-300 disabled:opacity-50 transition-all active:scale-[0.98] shadow-lg shadow-lime-500/20"
                    >
                        {loading ? 'Сохранение...' : 'Сохранить и войти'}
                    </button>

                    <Link
                        to="/auth/send-code"
                        className="block text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Назад ко входу
                    </Link>
                </form>
            </div>
        </div>
    );
}
