import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import {
    biometricSupported,
    disableBiometric,
    enableBiometric,
    getBiometricStatus,
} from '../../utils/biometric';

// Settings row to enable/disable passkey (biometric) login on this device.
export function BiometricToggle() {
    const [supported] = useState(() => biometricSupported());
    const [enabled, setEnabled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    useEffect(() => {
        if (!supported) return;
        getBiometricStatus().then((s) => setEnabled(!!s.enabled)).catch(() => {});
    }, [supported]);

    if (!supported) return null;

    const toggle = async () => {
        setBusy(true);
        setErr('');
        try {
            if (enabled) {
                await disableBiometric();
                setEnabled(false);
            } else {
                await enableBiometric();
                setEnabled(true);
            }
        } catch {
            setErr('Не удалось изменить настройку биометрии');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="w-full mt-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-lime-400/20 bg-lime-400/10">
                    <Fingerprint className="h-5 w-5 text-lime-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-100">Вход по биометрии</div>
                    <div className="text-xs text-zinc-500">
                        {enabled ? 'Включён на этом устройстве' : 'Заходите по отпечатку или Face ID'}
                    </div>
                </div>
                <button
                    onClick={toggle}
                    disabled={busy}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                        enabled
                            ? 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                            : 'bg-lime-400 text-zinc-900 hover:bg-lime-300'
                    }`}
                >
                    {busy ? '…' : enabled ? 'Отключить' : 'Включить'}
                </button>
            </div>
            {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
        </div>
    );
}
