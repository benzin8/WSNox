import { useRef, useState } from "react";
import {
    X,
    Save,
    Lock,
    Sun,
    Moon,
    Monitor,
    Upload,
    Trash2,
    User,
    Sparkles,
    Bell,
    Camera,
    Globe,
} from "lucide-react";
import { NotificationSettingsTab } from "../../features/notifications";
import { useTheme } from "../../features/theme";
import { useProfile } from "../../hooks/useProfile";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Avatar } from "./Avatar";
import { AvatarCropper } from "./AvatarCropper";
import { ProfileShell } from "./ProfileShell";

const PRESENCE_OPTIONS = [
    { value: "",          label: "Обычный",       icon: Globe },
    { value: "dnd",       label: "Не беспокоить", icon: Bell },
    { value: "invisible", label: "Невидимка",     icon: Moon },
];

const TABS = [
    { id: "profile",       label: "Профиль",      icon: User },
    { id: "appearance",    label: "Оформление",   icon: Sparkles },
    { id: "security",      label: "Безопасность", icon: Lock },
    { id: "notifications", label: "Уведомления",  icon: Bell },
];

const ACCENT_PALETTE = ["#a3e635", "#22d3ee", "#a78bfa", "#fb7185", "#fbbf24"];

const INPUT_BG = "rgba(39,39,42,0.4)";
const INPUT_BORDER = "rgba(63,63,70,0.6)";

function inputStyle(m, extra = {}) {
    return {
        background: INPUT_BG,
        border: `1px solid ${INPUT_BORDER}`,
        minHeight: m ? 48 : 42,
        ...extra,
    };
}

function handleFocus(e) {
    e.target.style.borderColor = "rgba(163,230,53,0.6)";
    e.target.style.boxShadow = "0 0 0 3px rgba(163,230,53,0.18)";
}
function handleBlur(e) {
    e.target.style.borderColor = INPUT_BORDER;
    e.target.style.boxShadow = "none";
}

function Field({ label, hint, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400 font-medium">{label}</label>
            {children}
            {hint && <p className="text-[11px] text-zinc-500 leading-relaxed">{hint}</p>}
        </div>
    );
}

function Tabs({ active, onChange, m }) {
    return (
        <div
            className="flex gap-1 p-1 rounded-2xl overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
                background: "rgba(24,24,27,0.6)",
                border: "1px solid rgba(39,39,42,0.85)",
            }}
        >
            {TABS.map((t) => {
                const on = active === t.id;
                const Icon = t.icon;
                return (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => onChange(t.id)}
                        className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold rounded-xl shrink-0"
                        style={{
                            padding: m ? "10px 14px" : "8px 12px",
                            minHeight: m ? 40 : undefined,
                            transition: "color .15s ease",
                            color: on ? "#a3e635" : "#a1a1aa",
                            background: on ? "rgba(163,230,53,0.10)" : "transparent",
                            border: on
                                ? "1px solid rgba(163,230,53,0.22)"
                                : "1px solid transparent",
                        }}
                    >
                        <Icon size={14} /> {t.label}
                    </button>
                );
            })}
        </div>
    );
}

function ProfileTab({ m, profile, onSave, onClose, isSaving }) {
    const [displayName, setDisplayName] = useState(profile?.display_name || "");
    const [bio, setBio] = useState(profile?.bio || "");
    const [presence, setPresence] = useState(profile?.presence_preference ?? "");

    const { uploadAvatar, deleteAvatar } = useProfile();
    const fileInputRef = useRef(null);
    const [cropSrc, setCropSrc] = useState(null);
    const [avatarBusy, setAvatarBusy] = useState(false);
    const [avatarError, setAvatarError] = useState("");
    const [localAvatar, setLocalAvatar] = useState({
        url: profile?.avatar_url,
        thumb: profile?.avatar_thumb_url,
        uploadedAt: profile?.avatar_uploaded_at,
    });

    const initials = (displayName || profile?.name || profile?.username || "")
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("");

    const openPicker = () => fileInputRef.current?.click();

    const onFileChange = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => setCropSrc(reader.result);
        reader.readAsDataURL(f);
        e.target.value = "";
    };

    const handleCropConfirm = async (blob) => {
        setAvatarBusy(true);
        setAvatarError("");
        try {
            const updated = await uploadAvatar(blob);
            setLocalAvatar({
                url: updated.avatar_url,
                thumb: updated.avatar_thumb_url,
                uploadedAt: updated.avatar_uploaded_at,
            });
            setCropSrc(null);
        } catch (e) {
            setAvatarError(String(e));
        } finally {
            setAvatarBusy(false);
        }
    };

    const handleAvatarDelete = async () => {
        setAvatarBusy(true);
        setAvatarError("");
        try {
            const updated = await deleteAvatar();
            setLocalAvatar({
                url: updated.avatar_url,
                thumb: updated.avatar_thumb_url,
                uploadedAt: updated.avatar_uploaded_at,
            });
        } catch (e) {
            setAvatarError(String(e));
        } finally {
            setAvatarBusy(false);
        }
    };

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        await onSave({
            display_name: displayName,
            bio,
            presence_preference: presence === "" ? null : presence,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Avatar
                        url={localAvatar.url}
                        initials={initials}
                        size={m ? 84 : 76}
                    />
                    <div
                        className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center"
                        style={{
                            background: "#a3e635",
                            color: "#18181b",
                            border: "3px solid #09090b",
                        }}
                    >
                        <Camera size={14} />
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={openPicker}
                        disabled={avatarBusy}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 rounded-xl whitespace-nowrap disabled:opacity-50"
                        style={{
                            minHeight: m ? 40 : 34,
                            background: "rgba(163,230,53,0.10)",
                            color: "#a3e635",
                            border: "1px solid rgba(163,230,53,0.22)",
                        }}
                    >
                        <Upload size={13} />
                        {localAvatar.url ? "Изменить фото" : "Загрузить фото"}
                    </button>
                    {localAvatar.url && (
                        <button
                            type="button"
                            onClick={handleAvatarDelete}
                            disabled={avatarBusy}
                            className="inline-flex items-center gap-1.5 text-xs px-3 rounded-xl text-red-400 whitespace-nowrap disabled:opacity-50"
                            style={{
                                minHeight: m ? 40 : 34,
                                background: "rgba(248,113,113,0.06)",
                                border: "1px solid rgba(248,113,113,0.15)",
                            }}
                        >
                            <Trash2 size={13} /> Удалить
                        </button>
                    )}
                    {avatarError && (
                        <p className="text-[10px] text-red-400">{avatarError}</p>
                    )}
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onFileChange}
                />
            </div>

            <Field label="Отображаемое имя">
                <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={100}
                    className="w-full rounded-2xl px-3.5 text-sm text-zinc-100 focus:outline-none"
                    style={inputStyle(m)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="Как тебя называть?"
                />
            </Field>

            <Field label="О себе" hint={`${bio.length}/256`}>
                <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={256}
                    rows={3}
                    className="w-full rounded-2xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none resize-none"
                    style={inputStyle(m, { minHeight: 88 })}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="Расскажи о себе..."
                />
            </Field>

            <Field
                label="Видимость"
                hint="«Обычный» — статус автоматически. «Не беспокоить» — вы в сети с пометкой. «Невидимка» — все видят вас офлайн."
            >
                <div className="grid grid-cols-3 gap-2">
                    {PRESENCE_OPTIONS.map((o) => {
                        const on = presence === o.value;
                        const Icon = o.icon;
                        return (
                            <button
                                key={o.value || "normal"}
                                type="button"
                                onClick={() => setPresence(o.value)}
                                className="flex flex-col items-center gap-1.5 rounded-2xl"
                                style={{
                                    padding: m ? "12px 6px" : "10px 6px",
                                    background: on ? "rgba(163,230,53,0.10)" : "rgba(39,39,42,0.4)",
                                    border: on
                                        ? "1px solid rgba(163,230,53,0.30)"
                                        : `1px solid ${INPUT_BORDER}`,
                                    color: on ? "#a3e635" : "#a1a1aa",
                                }}
                            >
                                <Icon size={17} />
                                <span className="text-[11px] font-medium text-center leading-tight">
                                    {o.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Field>

            <EditFooter
                m={m}
                onClose={onClose}
                onPrimary={handleSubmit}
                isBusy={isSaving}
                primaryLabel={isSaving ? "Сохранение…" : "Сохранить"}
            />

            {cropSrc && (
                <AvatarCropper
                    src={cropSrc}
                    onCancel={() => setCropSrc(null)}
                    onConfirm={handleCropConfirm}
                />
            )}
        </form>
    );
}

function AppearanceTab({ m, onClose }) {
    const { preference, setPreference } = useTheme();

    const themes = [
        {
            v: "dark",
            label: "Тёмная",
            icon: Moon,
            desc: "Тёмный фон, яркий акцент",
            preview: ["#0a0a0c", "#27272a", "#a3e635"],
        },
        {
            v: "light",
            label: "Светлая",
            icon: Sun,
            desc: "Светлый фон, мягкие тона",
            preview: ["#f4f4f5", "#d4d4d8", "#65a30d"],
        },
        {
            v: "system",
            label: "Системная",
            icon: Monitor,
            desc: "Следовать за ОС",
            preview: ["#0a0a0c", "#f4f4f5", "#a3e635"],
        },
    ];

    return (
        <div className="flex flex-col gap-3">
            <p className="text-xs text-zinc-400 font-medium">Тема оформления</p>
            <div className="grid grid-cols-3 gap-2">
                {themes.map((o) => {
                    const on = preference === o.v;
                    const Icon = o.icon;
                    return (
                        <button
                            key={o.v}
                            type="button"
                            onClick={() => setPreference(o.v)}
                            className="flex flex-col rounded-2xl overflow-hidden text-left"
                            style={{
                                border: on
                                    ? "1px solid rgba(163,230,53,0.40)"
                                    : `1px solid ${INPUT_BORDER}`,
                                background: on ? "rgba(163,230,53,0.06)" : "rgba(39,39,42,0.3)",
                            }}
                        >
                            <div className="h-12 flex items-end gap-1 p-2" style={{ background: o.preview[0] }}>
                                <div className="flex-1 rounded" style={{ height: 8, background: o.preview[1] }} />
                                <div
                                    className="rounded-full"
                                    style={{ width: 12, height: 12, background: o.preview[2] }}
                                />
                            </div>
                            <div className="px-2.5 py-2.5 flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                    <Icon size={13} className={on ? "text-lime-400" : "text-zinc-500"} />
                                    <span
                                        className="text-xs font-semibold"
                                        style={{ color: on ? "#a3e635" : "#e4e4e7" }}
                                    >
                                        {o.label}
                                    </span>
                                </div>
                                <span
                                    className="text-[10px] leading-tight"
                                    style={{ color: on ? "rgba(163,230,53,0.7)" : "#71717a" }}
                                >
                                    {o.desc}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            <p className="text-xs text-zinc-400 font-medium mt-2">Акцентный цвет</p>
            <div className="flex items-center gap-2.5">
                {ACCENT_PALETTE.map((c, i) => (
                    <span
                        key={c}
                        title={i === 0 ? "Lime (текущий)" : "Выбор акцента — скоро"}
                        className="rounded-full inline-block"
                        style={{
                            width: m ? 40 : 34,
                            height: m ? 40 : 34,
                            background: c,
                            opacity: i === 0 ? 1 : 0.5,
                            boxShadow:
                                i === 0
                                    ? `0 0 0 3px #09090b, 0 0 0 5px ${c}`
                                    : "none",
                        }}
                    />
                ))}
            </div>
            <p className="text-[10px] text-zinc-500">
                Выбор акцентного цвета — в разработке.
            </p>

            <EditFooter m={m} onClose={onClose} secondaryOnly />
        </div>
    );
}

function SecurityTab({ m, onClose }) {
    const { changePassword } = useProfile();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const strength = Math.min(4, Math.floor(next.length / 3));
    const strengthColor =
        strength <= 1 ? "#fb7185" : strength <= 2 ? "#fbbf24" : "#a3e635";

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
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Lock size={14} className="text-zinc-500" /> Смена пароля
            </div>

            <Field label="Текущий пароль">
                <input
                    type="password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-2xl px-3.5 text-sm text-zinc-100 focus:outline-none"
                    style={inputStyle(m)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="••••••••"
                    required
                />
            </Field>

            <Field label="Новый пароль">
                <input
                    type="password"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl px-3.5 text-sm text-zinc-100 focus:outline-none"
                    style={inputStyle(m)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="••••••••"
                    required
                />
                <div className="flex gap-1 mt-1.5">
                    {[0, 1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-1 flex-1 rounded-full"
                            style={{ background: i < strength ? strengthColor : "#3f3f46" }}
                        />
                    ))}
                </div>
            </Field>

            <Field label="Повторите пароль">
                <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl px-3.5 text-sm text-zinc-100 focus:outline-none"
                    style={inputStyle(m)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder="••••••••"
                    required
                />
            </Field>

            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-lime-400">Пароль обновлён</p>}

            <EditFooter
                m={m}
                onClose={onClose}
                onPrimary={handleSubmit}
                isBusy={busy}
                primaryLabel={busy ? "Сохранение…" : "Сменить"}
                primaryType="submit"
            />
        </form>
    );
}

function EditFooter({ m, onClose, onPrimary, isBusy, primaryLabel, primaryType = "button", secondaryOnly = false }) {
    const buttonHeight = m ? 50 : 44;
    return (
        <div
            className="flex gap-2 px-5 py-4 -mx-5 -mb-4 mt-2"
            style={{
                borderTop: "1px solid rgba(39,39,42,0.85)",
                background: "rgba(9,9,11,0.6)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                paddingBottom: m ? "max(16px, env(safe-area-inset-bottom))" : 16,
            }}
        >
            <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl font-medium text-sm text-zinc-300 active:scale-[0.98]"
                style={{
                    minHeight: buttonHeight,
                    background: "rgba(39,39,42,0.5)",
                    border: `1px solid ${INPUT_BORDER}`,
                    transition: "transform .15s ease",
                }}
            >
                {secondaryOnly ? "Закрыть" : "Отмена"}
            </button>
            {!secondaryOnly && (
                <button
                    type={primaryType}
                    onClick={primaryType === "submit" ? undefined : onPrimary}
                    disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl font-semibold text-sm active:scale-[0.98] disabled:opacity-60"
                    style={{
                        minHeight: buttonHeight,
                        background: "#a3e635",
                        color: "#18181b",
                        boxShadow: "0 8px 24px rgba(163,230,53,0.25)",
                        transition: "transform .15s ease, background-color .15s ease",
                    }}
                >
                    <Save size={15} /> {primaryLabel}
                </button>
            )}
        </div>
    );
}

export const EditProfileModal = ({ profile, onClose, onSave, initialTab = "profile" }) => {
    const isMobile = useMediaQuery("(max-width: 767px)");
    const [activeTab, setActiveTab] = useState(initialTab);
    const [isSaving, setIsSaving] = useState(false);

    const wrappedSave = async (data) => {
        setIsSaving(true);
        try {
            await onSave(data);
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <ProfileShell onClose={onClose} variant="edit">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                <h3
                    className="font-bold tracking-tight text-zinc-100"
                    style={{ fontSize: isMobile ? 19 : 17 }}
                >
                    Редактировать
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center justify-center rounded-full text-zinc-400"
                    style={{
                        width: isMobile ? 40 : 34,
                        height: isMobile ? 40 : 34,
                        background: "rgba(39,39,42,0.5)",
                        transition: "color .15s ease, background-color .15s ease",
                    }}
                    aria-label="Закрыть"
                >
                    <X size={isMobile ? 20 : 16} />
                </button>
            </div>

            <div className="px-5 shrink-0">
                <Tabs active={activeTab} onChange={setActiveTab} m={isMobile} />
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-grow" style={{ minHeight: 0 }}>
                {activeTab === "profile" && (
                    <ProfileTab
                        m={isMobile}
                        profile={profile}
                        onSave={wrappedSave}
                        onClose={onClose}
                        isSaving={isSaving}
                    />
                )}
                {activeTab === "appearance" && <AppearanceTab m={isMobile} onClose={onClose} />}
                {activeTab === "security" && <SecurityTab m={isMobile} onClose={onClose} />}
                {activeTab === "notifications" && (
                    <div className="flex flex-col gap-3">
                        <NotificationSettingsTab />
                        <EditFooter m={isMobile} onClose={onClose} secondaryOnly />
                    </div>
                )}
            </div>
        </ProfileShell>
    );
};
