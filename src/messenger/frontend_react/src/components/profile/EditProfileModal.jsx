import { useState } from "react";
import { X, Save } from "lucide-react";

const STATUS_OPTIONS = ["Online", "Offline", "Не беспокоить", "Недоступен"];

export const EditProfileModal = ({ profile, onClose, onSave, onSendPhoneCode, onVerifyPhoneCode }) => {
    const [activeTab, setActiveTab] = useState("profile");

    // Profile tab state
    const [displayName, setDisplayName] = useState(profile?.display_name || "");
    const [bio, setBio] = useState(profile?.bio || "");
    const [status, setStatus] = useState(profile?.status || "Online");
    const [isSaving, setIsSaving] = useState(false);

    // Personal tab state
    const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || "+7");
    const [phoneCode, setPhoneCode] = useState("");
    const [phoneStep, setPhoneStep] = useState("idle"); // idle | code_sent | verified
    const [phoneError, setPhoneError] = useState("");
    const [phoneSending, setPhoneSending] = useState(false);
    const [phoneVerifying, setPhoneVerifying] = useState(false);

    const handlePhoneChange = (e) => {
        const val = e.target.value;
        setPhoneNumber(val.startsWith("+7") ? val : "+7");
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onSave({ display_name: displayName, bio, status });
        setIsSaving(false);
        onClose();
    };

    const handleSendPhoneCode = async () => {
        setPhoneError("");
        setPhoneSending(true);
        try {
            await onSendPhoneCode(phoneNumber);
            setPhoneStep("code_sent");
        } catch (err) {
            setPhoneError(err);
        } finally {
            setPhoneSending(false);
        }
    };

    const handleVerifyPhoneCode = async () => {
        setPhoneError("");
        setPhoneVerifying(true);
        try {
            await onVerifyPhoneCode(phoneNumber, phoneCode);
            setPhoneStep("verified");
        } catch (err) {
            setPhoneError(err);
        } finally {
            setPhoneVerifying(false);
        }
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
                        onClick={() => setActiveTab("personal")}
                        className={`flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
                            activeTab === "personal"
                                ? "bg-zinc-700 text-zinc-100"
                                : "text-zinc-400 hover:text-zinc-200"
                        }`}
                    >
                        Личные данные
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

                {/* Personal data tab */}
                {activeTab === "personal" && (
                    <div className="flex flex-col gap-3">
                        <label className="text-xs text-zinc-400 font-medium">
                            Номер телефона
                            {profile?.phone_number && (
                                <span className="ml-1 text-lime-400">({profile.phone_number})</span>
                            )}
                        </label>

                        {phoneStep === "verified" ? (
                            <div className="text-sm text-lime-400 font-medium">Номер подтверждён!</div>
                        ) : (
                            <>
                                <input
                                    value={phoneNumber}
                                    onChange={handlePhoneChange}
                                    placeholder="+79001234567"
                                    inputMode="tel"
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all"
                                    disabled={phoneStep === "code_sent"}
                                />

                                {phoneStep === "idle" && (
                                    <button
                                        onClick={handleSendPhoneCode}
                                        disabled={phoneSending || phoneNumber.length < 4}
                                        className="w-full text-xs font-semibold px-3 py-2 bg-zinc-700 text-zinc-200 rounded-xl hover:bg-zinc-600 disabled:opacity-50 transition-colors"
                                    >
                                        {phoneSending ? "Отправка..." : "Получить код"}
                                    </button>
                                )}

                                {phoneStep === "code_sent" && (
                                    <div className="flex flex-col gap-2">
                                        <input
                                            value={phoneCode}
                                            onChange={(e) => setPhoneCode(e.target.value)}
                                            placeholder="123456"
                                            maxLength={6}
                                            inputMode="numeric"
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 text-center tracking-widest font-bold focus:outline-none focus:border-lime-400/60 transition-all"
                                        />
                                        <button
                                            onClick={handleVerifyPhoneCode}
                                            disabled={phoneVerifying || phoneCode.length < 4}
                                            className="w-full text-xs font-semibold px-3 py-2 bg-lime-400 text-zinc-900 rounded-xl hover:bg-lime-300 disabled:opacity-50 transition-colors"
                                        >
                                            {phoneVerifying ? "Проверка..." : "Подтвердить"}
                                        </button>
                                    </div>
                                )}

                                {phoneError && (
                                    <p className="text-xs text-red-400">{String(phoneError)}</p>
                                )}
                            </>
                        )}

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
