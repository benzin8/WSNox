import { X, Edit3 } from "lucide-react";

/**
 * ProfileModal — shows a user's profile.
 * Props:
 *   profile      — UserProfileResponse object from API
 *   isOwnProfile — bool, show Edit button when true
 *   onClose      — called when overlay or X is clicked
 *   onEdit       — called when Edit button is clicked (own profile only)
 */
export const ProfileModal = ({ profile, isOwnProfile, onClose, onEdit }) => {
    if (!profile) return null;

    // Show up to two uppercase initials as the avatar placeholder
    const initials = (profile.display_name || profile.name || profile.username)
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("");

    return (
        // Dark overlay — clicking outside closes the modal
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            {/* Modal card — stop propagation so overlay handler doesn't fire */}
            <div
                className="relative w-80 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                    <X size={18} />
                </button>

                {/* Avatar */}
                <div className="w-20 h-20 rounded-full bg-lime-400 flex items-center justify-center text-zinc-900 text-2xl font-bold select-none">
                    {initials}
                </div>

                {/* Display name + username */}
                <div className="text-center">
                    <h2 className="text-lg font-bold text-zinc-100">
                        {profile.display_name || profile.name}
                    </h2>
                    <p className="text-sm text-zinc-400">@{profile.username}</p>
                </div>

                {/* Presence badge */}
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                        profile.online
                            ? "bg-lime-400/15 text-lime-400"
                            : "bg-zinc-700 text-zinc-400"
                    }`}>
                        {profile.online ? "в сети" : "не в сети"}
                    </span>
                    {profile.presence_preference === "dnd" && (
                        <span className="text-xs font-medium px-3 py-1 rounded-full bg-amber-400/15 text-amber-400">
                            Не беспокоить
                        </span>
                    )}
                </div>

                {/* Bio */}
                {profile.bio && (
                    <p className="text-sm text-zinc-300 text-center leading-relaxed">
                        {profile.bio}
                    </p>
                )}

                {/* Edit button — visible only for own profile */}
                {isOwnProfile && (
                    <button
                        onClick={onEdit}
                        className="mt-2 flex items-center gap-2 bg-lime-400 text-zinc-900 font-semibold text-sm px-5 py-2 rounded-xl hover:bg-lime-300 transition-colors"
                    >
                        <Edit3 size={15} />
                        Редактировать
                    </button>
                )}
            </div>
        </div>
    );
};
