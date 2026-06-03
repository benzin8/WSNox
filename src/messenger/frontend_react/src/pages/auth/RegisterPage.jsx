import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import axios from 'axios';
import { parseApiError } from '../../utils/parseApiError';
import PasswordStrengthBar from '../../components/auth/PasswordStrengthBar';
import { AuthBackdrop } from '../../components/auth/AuthBackdrop';
import { AuthCardWrapper } from '../../components/auth/AuthCardWrapper';
import { useEnergy } from '../../features/energy';
import { upsertAccount, isAddingAccount, endAddAccount } from '../../features/accounts/accountStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function RegisterPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { enterAuth, beginTransit } = useEnergy();
    const email = location.state?.email || '';

    const [formData, setFormData] = useState({ name: '', username: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const isSubmitting = useRef(false);

    useEffect(() => { enterAuth(); }, [enterAuth]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting.current) return;
        isSubmitting.current = true;
        setLoading(true);
        setError('');

        try {
            const response = await axios.post(`${API_BASE}/auth/register`, {
                email,
                ...formData
            });

            const { access_token, user } = response.data;
            const adding = isAddingAccount();
            upsertAccount(user, access_token);
            endAddAccount();

            if (adding) {
                window.location.assign('/chat');
                return;
            }
            window.dispatchEvent(new Event('storage'));
            beginTransit();
            setTimeout(() => navigate('/chat'), 950);
            return;
        } catch (err) {
            if (err.response?.data?.detail === 'Email not verified') {
                navigate('/auth/send-code', { state: { email } });
                return;
            }
            setError(parseApiError(err, 'Registration failed'));
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
            <AuthBackdrop step="register" />

            <AuthCardWrapper>
                {/* Pill badge */}
                <div className="flex justify-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/40 text-xs text-zinc-400 backdrop-blur-sm">
                        <Sparkles className="w-3.5 h-3.5 text-lime-400" />
                        <span>Шаг 3 из 3 — Профиль</span>
                    </div>
                </div>

                {/* Card */}
                <div className="p-8 rounded-2xl border border-zinc-800/80 bg-zinc-900/50">
                    <div className="mb-8 text-center">
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.08] text-zinc-100">Заполните профиль</h1>
                        <p className="mt-3 text-zinc-400 leading-relaxed">Почти готово! Последний штрих.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300">Отображаемое имя</label>
                            <input
                                type="text"
                                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-300">Юзернейм</label>
                            <input
                                type="text"
                                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                                value={formData.username}
                                onChange={(e) => setFormData({...formData, username: e.target.value})}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-300">Пароль</label>
                            <input
                                type="password"
                                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                                value={formData.password}
                                onChange={(e) => setFormData({...formData, password: e.target.value})}
                                required
                            />
                            <PasswordStrengthBar password={formData.password} />
                        </div>

                        {error && (
                            <div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="group w-full flex items-center justify-center gap-2 rounded-xl bg-lime-400 p-4 font-semibold text-zinc-900 transition-all duration-300 hover:bg-lime-300 hover:shadow-[0_0_30px_rgba(163,230,53,0.25)] disabled:opacity-50 active:scale-[0.97] mt-4"
                        >
                            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
                            {!loading && <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />}
                        </button>
                    </form>
                </div>
            </AuthCardWrapper>
        </div>
    );
}
