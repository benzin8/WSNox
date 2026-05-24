import { X, Edit3, Calendar, Hash, Mail } from "lucide-react";

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

export const ProfileModal = ({ profile, isOwnProfile, onClose, onEdit }) => {
    if (!profile) return null;

    const initials = (profile.display_name || profile.name || profile.username)
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("");

    const joined = formatJoinedDate(profile.created_at);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
            onClick={onClose}
        >
            <div
                className="relative w-[22rem] max-w-[95vw] bg-zinc-900/50 border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden animate-popIn"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Gradient header with lime glow */}
                <div className="relative h-24 bg-gradient-to-br from-lime-400/30 via-lime-400/10 to-zinc-900/50 overflow-hidden">
                    {/* Glow orb behind avatar */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-[200px] h-[200px] rounded-full bg-lime-400/[0.08] blur-[60px] pointer-events-none" />
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 text-zinc-200/80 hover:text-white bg-black/20 hover:bg-black/40 rounded-full w-8 h-8 flex items-center justify-center transition-all duration-300"
                        aria-label="Закрыть"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="px-6 pb-6 -mt-12 flex flex-col items-center gap-3">
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full bg-lime-400 flex items-center justify-center text-zinc-900 text-3xl font-bold select-none border-4 border-zinc-900 shadow-xl shadow-lime-400/20">
                            {initials}
                        </div>
                        <span
                            className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-zinc-900 ${
                                profile.online ? "bg-lime-400" : "bg-zinc-600"
                            }`}
                            title={profile.online ? "в сети" : "не в сети"}
                        />
                    </div>

                    <div className="text-center">
                        <h2 className="text-xl font-bold tracking-tight text-zinc-100">
                            {profile.display_name || profile.name}
                        </h2>
                        <p className="text-sm text-zinc-400">@{profile.username}</p>
                    </div>

                    {/* Status pills */}
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                        <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border backdrop-blur-sm transition-colors ${
                                profile.online
                                    ? "bg-lime-400/10 text-lime-400 border-lime-400/20"
                                    : "bg-zinc-800/40 text-zinc-400 border-zinc-700/60"
                            }`}
                        >
                            {profile.online ? "в сети" : "не в сети"}
                        </span>
                        {profile.presence_preference === "dnd" && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 backdrop-blur-sm">
                                Не беспокоить
                            </span>
                        )}
                    </div>

                    {/* Bio */}
                    {profile.bio && (
                        <p className="text-sm text-zinc-300 text-center leading-relaxed mt-1">
                            {profile.bio}
                        </p>
                    )}

                    {/* Meta block */}
                    <div className="w-full mt-2 grid gap-2 rounded-2xl p-4 border border-zinc-800/80 bg-zinc-900/50">
                        {profile.email && (
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                                <Mail size={14} className="text-zinc-500 shrink-0" />
                                <span className="break-all">{profile.email}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <Hash size={14} className="text-zinc-500 shrink-0" />
                            <span>ID {profile.user_id}</span>
                        </div>
                        {joined && (
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                                <Calendar size={14} className="text-zinc-500 shrink-0" />
                                <span>С нами с {joined}</span>
                            </div>
                        )}
                    </div>

                    {isOwnProfile && (
                        <button
                            onClick={onEdit}
                            className="w-full mt-3 flex items-center justify-center gap-2 bg-lime-400 text-zinc-900 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-lime-300 hover:shadow-[0_0_30px_rgba(163,230,53,0.25)] active:scale-[0.97] transition-all duration-300"
                        >
                            <Edit3 size={15} />
                            Редактировать
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
