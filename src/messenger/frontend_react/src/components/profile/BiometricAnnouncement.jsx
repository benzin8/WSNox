import { useEffect, useState } from 'react';
import { Fingerprint, X } from 'lucide-react';
import { biometricSupported, enableBiometric, getBiometricStatus } from '../../utils/biometric';

const FLAG = 'biometric_announced_v1';

// One-time "we shipped biometric login" prompt for existing users. Lets them
// enable it on the spot and points to settings for managing it later.
export function BiometricAnnouncement() {
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!biometricSupported() || localStorage.getItem(FLAG)) return;
        let alive = true;
        getBiometricStatus()
            .then((s) => { if (alive && !s.enabled) setShow(true); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    if (!show) return null;

    const dismiss = () => { localStorage.setItem(FLAG, '1'); setShow(false); };
    const connect = async () => {
        setBusy(true);
        try {
            await enableBiometric();
            localStorage.setItem(FLAG, '1');
            setShow(false);
        } catch {
            // user cancelled — keep the prompt available next time
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="relative w-full max-w-sm rounded-3xl border border-lime-400/20 bg-zinc-900 p-6 text-center shadow-2xl animate-popIn">
                <button
                    onClick={dismiss}
                    className="absolute right-3 top-3 text-zinc-500 transition-colors hover:text-zinc-300"
                    aria-label="Закрыть"
                >
                    <X className="h-5 w-5" />
                </button>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-lime-400/20 bg-lime-400/10">
                    <Fingerprint className="h-7 w-7 text-lime-400" />
                </div>
                <h3 className="text-lg font-bold text-zinc-100">Новинка: вход по биометрии</h3>
                <p className="mt-2 text-sm text-zinc-400">
                    Заходите по Face ID или отпечатку — без пароля. Подключить на этом устройстве?
                </p>
                <div className="mt-5 space-y-2">
                    <button
                        onClick={connect}
                        disabled={busy}
                        className="w-full rounded-xl bg-lime-400 py-3 font-semibold text-zinc-900 transition-all hover:bg-lime-300 disabled:opacity-50 active:scale-[0.98]"
                    >
                        {busy ? 'Подождите…' : 'Подключить'}
                    </button>
                    <button
                        onClick={dismiss}
                        disabled={busy}
                        className="w-full rounded-xl border border-zinc-700 py-3 text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                    >
                        Позже
                    </button>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                    Включить или отключить можно в Настройках профиля.
                </p>
            </div>
        </div>
    );
}
