import { useState } from "react";
import { X, Save } from "lucide-react";

const STATUS_OPTIONS = ["Online", "Offline", "Не беспокоить", "Недоступен"];

/**
 * EditProfileModal — form to update own profile.
 * Props:
 *   profile  — current UserProfileResponse (pre-fills the form)
 *   onClose  — called on cancel / overlay click
 *   onSave   — async (data) => updatedProfile; called with { display_name, bio, status }
 */
export const EditProfileModal = ({ profile, onClose, onSave }) => {
    const [displayName, setDisplayName] = useState(profile?.display_name || "");
    const [bio, setBio] = useState(profile?.bio || "");
    const [status, setStatus] = useState(profile?.status || "Online");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        await onSave({ display_name: displayName, bio, status });
        setIsSaving(false);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-80 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-zinc-100">Редактировать профиль</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Display name field */}
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

                {/* Bio field */}
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

                {/* Status select */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-400 font-medium">Статус</label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all"
                    >
                        {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                {/* Action buttons */}
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
            </div>
        </div>
    );
};
