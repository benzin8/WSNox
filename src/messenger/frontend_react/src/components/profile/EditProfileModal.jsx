import { useState } from "react";
import { X, Save, Lock, Sun, Moon, Monitor } from "lucide-react";
import { NotificationSettingsTab } from "../../features/notifications";
import { useTheme } from "../../features/theme";
import PasswordStrengthBar from "../auth/PasswordStrengthBar";
import { useProfile } from "../../hooks/useProfile";

const PRESENCE_OPTIONS = [
    { value: "",          label: "Обычный" },
    { value: "dnd",       label: "Не беспокоить" },
    { value: "invisible", label: "Невидимка" },
];

export const EditProfileModal = ({ profile, onClose, onSave }) => {
    const [activeTab, setActiveTab] = useState("profile");

    const [displayName, setDisplayName] = useState(profile?.display_name || "");
    const [bio, setBio] = useState(profile?.bio || "");
    const [presencePreference, setPresencePreference] = useState(profile?.presence_preference ?? "");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        await onSave({
            display_name: displayName,
            bio,
            presence_preference: presencePreference === "" ? null : presencePreference,
        });
        setIsSaving(false);
        onClose();
    };

    const tabs = [
        { id: "profile",       label: "Профиль" },
        { id: "appearance",    label: "Оформление" },
        { id: "security",      label: "Безопасность" },
        { id: "notifications", label: "Уведомления" },
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
            onClick={onClose}
        >
            <div
                className="relative w-[22rem] max-w-[95vw] max-h-[90vh] overflow-y-auto bg-zinc-900/50 border border-zinc-800/80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-popIn"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h3 className="font-bold tracking-tight text-zinc-100">Редактировать профиль</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors duration-300">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs — pill style with lime active, horizontal scroll on overflow */}
                <div className="flex gap-1 rounded-xl p-1 border border-zinc-800/80 bg-zinc-900/50 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex-shrink-0 whitespace-nowrap text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-300 ${
                                activeTab === t.id
                                    ? "bg-lime-400/10 text-lime-400 border border-lime-400/20"
                                    : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Profile tab */}
                {activeTab === "profile" && (
                    <>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">Отображаемое имя</label>
                            <input
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                maxLength={100}
                                className="bg-zinc-800/30 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                                placeholder="Как тебя называть?"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">О себе</label>
                            <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                maxLength={256}
                                rows={3}
                                className="bg-zinc-800/30 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/40 transition-all duration-300 resize-none"
                                placeholder="Расскажи о себе..."
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">Видимость</label>
                            <select
                                value={presencePreference}
                                onChange={(e) => setPresencePreference(e.target.value)}
                                className="bg-zinc-800/30 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                            >
                                {PRESENCE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-zinc-500">
                                «Обычный» — статус определяется автоматически. «Не беспокоить» — собеседник видит вас в сети с пометкой. «Невидимка» — все видят вас офлайн.
                            </p>
                        </div>

                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={onClose}
                                className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-xl font-medium text-sm text-zinc-300 border border-zinc-700/60 bg-zinc-800/30 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 flex items-center justify-center gap-2 bg-lime-400 text-zinc-900 text-sm font-semibold py-2 rounded-xl hover:bg-lime-300 hover:shadow-[0_0_30px_rgba(163,230,53,0.25)] active:scale-[0.97] transition-all duration-300 disabled:opacity-50"
                            >
                                <Save size={14} />
                                {isSaving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </>
                )}

                {activeTab === "appearance" && <AppearanceTab onClose={onClose} />}

                {activeTab === "security" && <SecurityTab onClose={onClose} />}

                {activeTab === "notifications" && (
                    <div className="flex flex-col gap-3">
                        <NotificationSettingsTab />
                        <button
                            onClick={onClose}
                            className="w-full mt-2 inline-flex items-center justify-center px-4 py-2 rounded-xl font-medium text-sm text-zinc-300 border border-zinc-700/60 bg-zinc-800/30 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
                        >
                            Закрыть
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const THEME_OPTIONS = [
    { value: "dark",   label: "Тёмная",    icon: Moon,    desc: "Тёмный фон, яркий акцент" },
    { value: "light",  label: "Светлая",   icon: Sun,     desc: "Светлый фон, мягкие тона" },
    { value: "system", label: "Системная", icon: Monitor, desc: "Следовать за ОС" },
];

function AppearanceTab({ onClose }) {
    const { preference, setPreference } = useTheme();

    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-zinc-400 font-medium">Тема оформления</p>
            <div className="flex flex-col gap-2">
                {THEME_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = preference === opt.value;
                    return (
                        <button
                            key={opt.value}
                            onClick={() => setPreference(opt.value)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-300 border ${
                                active
                                    ? "bg-lime-400/10 border-lime-400/30 text-lime-400"
                                    : "bg-zinc-800/30 border-zinc-700/60 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
                            }`}
                        >
                            <Icon size={18} className={active ? "text-lime-400" : "text-zinc-500"} />
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold">{opt.label}</span>
                                <span className={`text-[10px] ${active ? "text-lime-400/70" : "text-zinc-500"}`}>{opt.desc}</span>
                            </div>
                        </button>
                    );
                })}
            </div>
            <button
                onClick={onClose}
                className="w-full mt-2 inline-flex items-center justify-center px-4 py-2 rounded-xl font-medium text-sm text-zinc-300 border border-zinc-700/60 bg-zinc-800/30 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
            >
                Закрыть
            </button>
        </div>
    );
}

function SecurityTab({ onClose }) {
    const { changePassword } = useProfile();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess(false);
        if (next.length < 8) { setError("Минимум 8 символов"); return; }
        if (next !== confirm) { setError("Пароли не совпадают"); return; }
        if (next === current) { setError("Новый пароль совпадает с текущим"); return; }
        setBusy(true);
        try {
            await changePassword(current, next);
            setSuccess(true);
            setCurrent(""); setNext(""); setConfirm("");
        } catch (err) {
            setError(String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Lock size={14} className="text-zinc-500" />
                <span>Смена пароля</span>
            </div>


            <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400 font-medium">Текущий пароль</label>
                <input
                    type="password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    autoComplete="current-password"
                    className="bg-zinc-800/30 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                    placeholder="••••••••"
                    required
                />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400 font-medium">Новый пароль</label>
                <input
                    type="password"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    autoComplete="new-password"
                    className="bg-zinc-800/30 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                    placeholder="••••••••"
                    required
                />
                <PasswordStrengthBar password={next} />
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400 font-medium">Ещё раз</label>
                <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="bg-zinc-800/30 border border-zinc-700/60 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/40 transition-all duration-300"
                    placeholder="••••••••"
                    required
                />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-lime-400">Пароль обновлён</p>}

            <div className="flex gap-2 mt-1">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-xl font-medium text-sm text-zinc-300 border border-zinc-700/60 bg-zinc-800/30 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
                >
                    Закрыть
                </button>
                <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 bg-lime-400 text-zinc-900 text-sm font-semibold py-2 rounded-xl hover:bg-lime-300 hover:shadow-[0_0_30px_rgba(163,230,53,0.25)] active:scale-[0.97] transition-all duration-300 disabled:opacity-50"
                >
                    {busy ? "Сохранение..." : "Сменить"}
                </button>
            </div>
        </form>
    );
}
