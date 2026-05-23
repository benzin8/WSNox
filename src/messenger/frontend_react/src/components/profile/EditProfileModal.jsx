import { useState } from "react";
import { X, Save } from "lucide-react";
import { NotificationSettingsTab } from "../../features/notifications";

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

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-80 max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-zinc-100">Редактировать профиль</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-zinc-800 rounded-xl p-1">
                    <button
                        onClick={() => setActiveTab("profile")}
                        className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
                            activeTab === "profile"
                                ? "bg-zinc-700 text-zinc-100"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        Профиль
                    </button>
                    <button
                        onClick={() => setActiveTab("notifications")}
                        className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
                            activeTab === "notifications"
                                ? "bg-zinc-700 text-zinc-100"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        Уведомления
                    </button>
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
                                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all"
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
                                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all resize-none"
                                placeholder="Расскажи о себе..."
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-400 font-medium">Видимость</label>
                            <select
                                value={presencePreference}
                                onChange={(e) => setPresencePreference(e.target.value)}
                                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all"
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
                                className="flex-1 bg-zinc-800 text-zinc-300 text-sm font-medium py-2 rounded-xl hover:bg-zinc-700 transition-colors"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 flex items-center justify-center gap-2 bg-lime-400 text-zinc-900 text-sm font-semibold py-2 rounded-xl hover:bg-lime-300 transition-colors disabled:opacity-50"
                            >
                                <Save size={14} />
                                {isSaving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </>
                )}

                {/* Notifications tab */}
                {activeTab === "notifications" && (
                    <div className="flex flex-col gap-3">
                        <NotificationSettingsTab />
                        <button
                            onClick={onClose}
                            className="w-full mt-2 bg-zinc-800 text-zinc-300 text-sm font-medium py-2 rounded-xl hover:bg-zinc-700 transition-colors"
                        >
                            Закрыть
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
