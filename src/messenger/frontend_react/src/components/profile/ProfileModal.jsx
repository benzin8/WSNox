import { X, Edit3, Calendar, Hash, Mail } from "lucide-react";
import { Avatar } from "./Avatar";
import { Cover, MetaRow, Pill } from "./parts";
import { ProfileShell } from "./ProfileShell";
import { AccountsBlock } from "../../features/accounts/AccountsBlock";
import { useMediaQuery } from "../../hooks/useMediaQuery";

const MONTHS_RU = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatJoinedDate(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

export const ProfileModal = ({ profile, isOwnProfile, onClose, onEdit, onAddAccount }) => {
    const isMobile = useMediaQuery("(max-width: 767px)");
    if (!profile) return null;

    const initials = (profile.display_name || profile.name || profile.username || "?")
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("");

    const joined = formatJoinedDate(profile.created_at);
    const avatarSize = isMobile ? 104 : 96;
    const coverHeight = isMobile ? 124 : 112;
    const closeSize = isMobile ? 40 : 34;

    return (
        <ProfileShell onClose={onClose} variant="view">
            <div className="relative">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute z-20 flex items-center justify-center rounded-full text-zinc-100"
                    style={{
                        top: 14,
                        right: 14,
                        width: closeSize,
                        height: closeSize,
                        background: "rgba(0,0,0,0.30)",
                        backdropFilter: "blur(6px)",
                        WebkitBackdropFilter: "blur(6px)",
                    }}
                    aria-label="Закрыть"
                >
                    <X size={isMobile ? 20 : 16} />
                </button>

                <Cover height={coverHeight} />

                <div
                    className={`px-5 ${isMobile ? "pb-6" : "pb-5"} flex flex-col items-center`}
                    style={{ marginTop: isMobile ? -56 : -52 }}
                >
                    <Avatar
                        url={profile.avatar_url}
                        initials={initials}
                        online={profile.online}
                        size={avatarSize}
                        ring
                    />

                    <div className="text-center mt-3">
                        <h2
                            className="font-bold tracking-tight text-zinc-100"
                            style={{ fontSize: isMobile ? 24 : 21, letterSpacing: "-0.02em" }}
                        >
                            {profile.display_name || profile.name || `@${profile.username}`}
                        </h2>
                        {profile.username && (
                            <p className="text-sm text-zinc-500 mt-0.5">@{profile.username}</p>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-center mt-3">
                        <Pill tone={profile.online ? "lime" : "zinc"}>
                            <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                    background: profile.online ? "#a3e635" : "#71717a",
                                    boxShadow: profile.online ? "0 0 6px rgba(163,230,53,0.8)" : "none",
                                }}
                            />
                            {profile.online ? "в сети" : "не в сети"}
                        </Pill>
                        {profile.presence_preference === "dnd" && (
                            <Pill tone="amber">Не беспокоить</Pill>
                        )}
                    </div>

                    {profile.bio && (
                        <p
                            className="text-sm text-zinc-300 text-center leading-relaxed mt-4 px-1"
                            style={{ textWrap: "pretty" }}
                        >
                            {profile.bio}
                        </p>
                    )}

                    <div className="w-full grid gap-2 mt-4">
                        {profile.email && (
                            <MetaRow
                                icon={<Mail size={16} />}
                                label="Email"
                                value={profile.email}
                                copyable
                            />
                        )}
                        <MetaRow
                            icon={<Hash size={16} />}
                            label="ID пользователя"
                            value={profile.user_id}
                            copyable
                        />
                        {joined && (
                            <MetaRow
                                icon={<Calendar size={16} />}
                                label="В WSNox с"
                                value={joined}
                            />
                        )}
                    </div>

                    {isOwnProfile && (
                        <>
                            <button
                                type="button"
                                onClick={onEdit}
                                className="w-full mt-4 flex items-center justify-center gap-2 font-semibold rounded-2xl active:scale-[0.98] hover:bg-lime-300"
                                style={{
                                    background: "#a3e635",
                                    color: "#18181b",
                                    minHeight: isMobile ? 52 : 46,
                                    fontSize: 15,
                                    boxShadow: "0 10px 30px rgba(163,230,53,0.28)",
                                    transition: "transform .15s ease, background-color .15s ease",
                                }}
                            >
                                <Edit3 size={16} /> Редактировать профиль
                            </button>
                            <div className="w-full mt-3">
                                <AccountsBlock onAddAccount={onAddAccount} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </ProfileShell>
    );
};
