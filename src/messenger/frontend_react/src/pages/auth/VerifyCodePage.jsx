import { useState, useRef } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Shield, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { parseApiError } from '../../utils/parseApiError';
import { AuthBackdrop } from '../../components/auth/AuthBackdrop';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function VerifyCodePage() {
    const location = useLocation();
    const navigate = useNavigate();
    const email = location.state?.email || '';

    const [code, setCode] = useState('');
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
            const response = await axios.post(`${API_BASE}/auth/verify-code`, {
                email,
                code: code.trim()
            });

            if (response.data.status === 'register') {
                navigate('/auth/register', { state: { email } });
            } else if (response.data.status === 'need_password') {
                navigate('/auth/login', { state: { email } });
            }
        } catch (err) {
            setError(parseApiError(err, 'Invalid verification code'));
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    if (!email) {
        return <Navigate to="/auth/send-code" replace />;
    }

    return (
        <div className="min-h-dvh flex items-center justify-center p-4 bg-zinc-950 relative overflow-hidden">
            <AuthBackdrop step="code" />

            <div className="relative w-full max-w-md">
                {/* Pill badge */}
                <div className="flex justify-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/40 text-xs text-zinc-400 backdrop-blur-sm">
                        <Shield className="w-3.5 h-3.5 text-lime-400" />
                        <span>Шаг 2 из 3 — Подтверждение</span>
                    </div>
                </div>

                {/* Card */}
                <div className="p-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/50">
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.08] text-zinc-100">Введите код</h1>
                        <p className="mt-3 text-zinc-400 leading-relaxed">Отправлен на <strong className="text-zinc-300">{email}</strong></p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="code" className="block text-sm font-medium text-zinc-300">
                                Код подтверждения
                            </label>
                            <input
                                id="code"
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="123456"
                                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 text-center tracking-[0.5em] text-2xl font-bold text-lime-400 placeholder:text-zinc-700 placeholder:tracking-normal focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
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
                            className="group w-full flex items-center justify-center gap-2 rounded-xl bg-lime-400 p-4 font-semibold text-zinc-900 transition-all duration-300 hover:bg-lime-300 hover:shadow-[0_0_30px_rgba(163,230,53,0.25)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
                        >
                            {loading ? 'Проверка...' : 'Проверить'}
                            {!loading && <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />}
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/auth/send-code')}
                            className="w-full inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl font-semibold text-sm text-zinc-300 border border-zinc-700/60 bg-zinc-800/30 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
                        >
                            Сменить email
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/auth/register', { state: { email } })}
                            className="w-full inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl font-semibold text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            Пропустить →
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
