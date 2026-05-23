import { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { parseApiError } from '../../utils/parseApiError';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function ForgotPasswordPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState(location.state?.email || '');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const isSubmitting = useRef(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting.current) return;
        isSubmitting.current = true;
        setLoading(true);
        setError('');
        try {
            await axios.post(`${API_BASE}/auth/forgot-password`, { email });
            setSent(true);
        } catch (err) {
            setError(parseApiError(err, 'Не удалось отправить письмо'));
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl animate-fadeIn">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">Сброс пароля</h1>
                    <p className="mt-2 text-zinc-400">
                        {sent
                            ? 'Если такой аккаунт существует, мы отправили письмо со ссылкой для сброса.'
                            : 'Введите email — пришлём ссылку для сброса пароля.'}
                    </p>
                </div>

                {sent ? (
                    <div className="space-y-4">
                        <div className="rounded-lg bg-lime-400/10 border border-lime-400/20 p-4 text-sm text-lime-300 leading-relaxed">
                            Проверьте папку «Входящие» (и «Спам» на всякий случай) для <strong>{email}</strong>. Ссылка действительна 30 минут.
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/auth/send-code')}
                            className="w-full rounded-xl bg-zinc-800 p-3 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
                        >
                            На страницу входа
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-zinc-300">Email</label>
                            <input
                                id="email"
                                type="email"
                                placeholder="you@example.com"
                                className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
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
                            {loading ? 'Отправка...' : 'Отправить ссылку'}
                        </button>

                        <Link
                            to="/auth/send-code"
                            className="block text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            Назад ко входу
                        </Link>
                    </form>
                )}
            </div>
        </div>
    );
}
