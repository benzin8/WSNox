import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function RegisterPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const phoneNumber = location.state?.phone_number || '';
    const code = location.state?.code || '';

    const [formData, setFormData] = useState({
        name: '',
        username: '',
        password: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await axios.post(`${API_BASE}/auth/register`, {
                phone_number: phoneNumber,
                code: code,
                ...formData
            });

            const { access_token, refresh_token } = response.data;
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            
            window.dispatchEvent(new Event('storage'));
            navigate('/chat');
        } catch (err) {
            setError(err.response?.data?.detail || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    if (!phoneNumber || !code) {
        console.log("No phone number or code");
        return <Navigate to="/auth/send-code" replace />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">Заполните профиль</h1>
                    <p className="mt-2 text-zinc-400">Почти готово! Расскажите о себе.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Отображаемое имя</label>
                        <input
                            type="text"
                            className="mt-1 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Юзернейм</label>
                        <input
                            type="text"
                            className="mt-1 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={formData.username}
                            onChange={(e) => setFormData({...formData, username: e.target.value})}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300">Пароль</label>
                        <input
                            type="password"
                            className="mt-1 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={formData.password}
                            onChange={(e) => setFormData({...formData, password: e.target.value})}
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
                        className="w-full rounded-xl bg-lime-400 p-4 font-bold text-zinc-900 hover:bg-lime-300 disabled:opacity-50 transition-all active:scale-[0.98] mt-4"
                    >
                        {loading ? 'Creating Account...' : 'Register'}
                    </button>
                </form>
            </div>
        </div>
    );
}
