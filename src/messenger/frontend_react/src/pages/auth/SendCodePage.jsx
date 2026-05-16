import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PatternFormat } from 'react-number-format';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export default function SendCodePage() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        const clearPhoneNumber = phoneNumber.slice(1).replace(/\D/g, '');

        try {
            await axios.post(`${API_BASE}/auth/send-code`, {
                 phone_number: clearPhoneNumber 
            });
            navigate('/auth/verify', { state: { phone_number: clearPhoneNumber } });
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to send code');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-lime-400">WSNox</h1>
                    <p className="mt-2 text-zinc-400">Введите ваш номер телефона для получения кода подтверждения</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-zinc-300">
                            Номер телефона
                        </label>
                        <PatternFormat
                            format="+7 (###) ###-##-##"
                            allowEmptyFormatting={false}
                            mask="_"
                            value={phoneNumber}
                            onValueChange={(values) => {
                                setPhoneNumber(values.formattedValue); 
                            }}
                            type="tel"
                            id="phone"
                            placeholder="+7 (900) 000-00-00"
                            className="mt-2 w-full rounded-xl border-zinc-700 bg-zinc-900/50 p-4 text-zinc-100 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none focus:ring-2 focus:ring-lime-500/20 transition-all"
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
                        {loading ? 'Отправка...' : 'Отправить код'}
                    </button>
                </form>
                
                <div className="mt-8 text-center text-xs text-zinc-500">
                    Продолжая, вы соглашаетесь с Условиями и Политикой конфиденциальности.
                </div>
            </div>
        </div>
    );
}