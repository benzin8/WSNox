import { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { parseApiError } from '../../utils/parseApiError';
import { AuthBackdrop } from '../../components/auth/AuthBackdrop';
import { AuthCardWrapper } from '../../components/auth/AuthCardWrapper';

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
        <div className="min-h-dvh flex items-center justify-center p-4 bg-zinc-950 relative overflow-hidden">
            <AuthBackdrop step="email" />

            <AuthCardWrapper>
                {/* Pill badge */}
                <div className="flex justify-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/40 text-xs text-zinc-400 backdrop-blur-sm">
                        <Lock className="w-3.5 h-3.5 text-lime-400" />
                        <span>Восстановление пароля</span>
                    </div>
                </div>

                {/* Card */}
                <div className="p-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/50">
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.08] text-zinc-100">Сброс пароля</h1>
                        <p className="mt-3 text-zinc-400 leading-relaxed">
                            {sent
                                ? 'Если такой аккаунт существует, мы отправили письмо со ссылкой для сброса.'
                                : 'Введите email — пришлём ссылку для сброса пароля.'}
                        </p>
                    </div>

                    {sent ? (
                        <div className="space-y-4">
                            <div className="rounded-xl bg-lime-400/10 border border-lime-400/20 p-4 text-sm text-lime-300 leading-relaxed">
                                Проверьте папку «Входящие» (и «Спам» на всякий случай) для <strong>{email}</strong>. Ссылка действительна 30 минут.
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate('/auth/send-code')}
                                className="w-full inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl font-semibold text-sm text-zinc-300 border border-zinc-700/60 bg-zinc-800/30 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
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
                                    className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 text-zinc-100 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            {error && (
                                <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="group w-full flex items-center justify-center gap-2 rounded-xl bg-lime-400 p-4 font-semibold text-zinc-900 transition-all duration-300 hover:bg-lime-300 hover:shadow-[0_0_30px_rgba(163,230,53,0.25)] disabled:opacity-50 active:scale-[0.97]"
                            >
                                {loading ? 'Отправка...' : 'Отправить ссылку'}
                                {!loading && <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />}
                            </button>

                            <Link
                                to="/auth/send-code"
                                className="block text-center inline-flex items-center justify-center w-full gap-2 px-7 py-3 rounded-xl font-semibold text-sm text-zinc-300 border border-zinc-700/60 bg-zinc-800/30 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
                            >
                                Назад ко входу
                            </Link>
                        </form>
                    )}
                </div>
            </AuthCardWrapper>
        </div>
    );
}
