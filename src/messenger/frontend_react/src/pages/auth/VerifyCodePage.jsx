import { useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function VerifyCodePage() {
    const location = useLocation();
    const navigate = useNavigate();
    const phoneNumber = location.state?.phone_number || '';
    
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await axios.post(`${API_BASE}/auth/verify-code`, {
                phone_number: phoneNumber,
                code: code
            });

            // response logic
            if (response.data.status === 'register') {
                navigate('/auth/register', { state: { phone_number: phoneNumber, code: code } });
            } else if (response.data.status === 'need_password') {
                navigate('/auth/login', { state: { phone_number: phoneNumber } });
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Invalid verification code');
        } finally {
            setLoading(false);
        }
    };

    if (!phoneNumber) {
        return <Navigate to="/auth/send-code" replace />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">Введите код</h1>
                    <p className="mt-2 text-zinc-400">Отправлен на номер <strong>{phoneNumber}</strong></p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="code" className="block text-sm font-medium text-zinc-300">
                            Код подтверждения
                        </label>
                        <input
                            id="code"
                            type="text"
                            placeholder="123456"
                            mask="999999"
                            className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-center tracking-[0.5em] text-2xl font-bold text-lime-400 placeholder:text-zinc-700 placeholder:tracking-normal focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
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
                        className="w-full rounded-xl bg-lime-400 p-4 font-bold text-zinc-900 hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-lg shadow-lime-500/20"
                    >
                        {loading ? 'Проверка...' : 'Проверить'}
                    </button>
                    
                    <button 
                        type="button"
                        onClick={() => navigate('/auth/send-code')}
                        className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Сменить номер
                    </button>
                </form>
            </div>
        </div>
    );
}