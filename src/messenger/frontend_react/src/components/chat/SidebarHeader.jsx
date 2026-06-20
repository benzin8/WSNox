import { useRef, useState } from "react";
import { ChevronDown, Camera } from "lucide-react";
import { Avatar } from "../profile/Avatar";
import { AccountMenu } from "./AccountMenu";
import { OnboardingNudges } from "./OnboardingNudges";

export function SidebarHeader({
  myProfile,
  isAdmin,
  onOpenOwnProfile,
  onOpenEditProfile,
  onOpenCreateGroup,
  onOpenCreateChannel,
  onOpenDashboard,
  onAddAccount,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef(null);

  const hasAvatar = !!(myProfile?.avatar_thumb_url || myProfile?.avatar_url);
  const initials = (myProfile?.display_name || myProfile?.name || "?")
    .slice(0, 1)
    .toUpperCase();

  const handleAction = (action) => {
    switch (action) {
      case "profile":
        onOpenOwnProfile?.();
        break;
      case "profile-appearance":
        onOpenEditProfile?.("appearance");
        break;
      case "group":
        onOpenCreateGroup?.();
        break;
      case "channel":
        onOpenCreateChannel?.();
        break;
      case "dashboard":
        onOpenDashboard?.();
        break;
      case "add-account":
        onAddAccount?.();
        break;
      case "logout":
        onLogout?.();
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative">
      <div
        className="px-3 py-3"
        style={{ borderBottom: "1px solid color-mix(in oklab, var(--color-zinc-800) 60%, transparent)" }}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-2xl text-left"
          style={{
            background: menuOpen ? "color-mix(in oklab, var(--color-zinc-700) 40%, transparent)" : "transparent",
            transition: "background-color .12s ease",
          }}
          onMouseEnter={(e) => {
            if (!menuOpen) e.currentTarget.style.background = "color-mix(in oklab, var(--color-zinc-700) 25%, transparent)";
          }}
          onMouseLeave={(e) => {
            if (!menuOpen) e.currentTarget.style.background = "transparent";
          }}
        >
          <div className="relative shrink-0">
            <Avatar
              url={myProfile?.avatar_thumb_url || myProfile?.avatar_url}
              initials={initials}
              size={42}
              online
            />
            {!hasAvatar && (
              <span
                className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none"
                style={{
                  background: "color-mix(in oklab, var(--color-zinc-950) 50%, transparent)",
                  border: "1.5px dashed var(--color-zinc-600)",
                  color: "var(--color-zinc-400)",
                }}
                title="Добавить фото"
              >
                <Camera size={18} />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-zinc-100 truncate leading-tight">
              {myProfile?.display_name || myProfile?.name || "Профиль"}
            </div>
            <div className="text-xs text-zinc-500 truncate">
              {myProfile?.username ? `@${myProfile.username}` : myProfile?.email || ""}
              {(myProfile?.username || myProfile?.email) && (
                <>
                  {" · "}
                  <span className="text-lime-400">в сети</span>
                </>
              )}
            </div>
          </div>
          <span
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400"
            style={{
              background: "color-mix(in oklab, var(--color-zinc-800) 70%, transparent)",
              border: "1px solid color-mix(in oklab, var(--color-zinc-700) 50%, transparent)",
            }}
          >
            <ChevronDown
              size={16}
              style={{ transform: menuOpen ? "rotate(180deg)" : "none" }}
            />
          </span>
        </button>

        <AccountMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={buttonRef}
          myProfile={myProfile}
          isAdmin={isAdmin}
          onAction={handleAction}
        />
      </div>

      <OnboardingNudges
        myProfile={myProfile}
        onOpenEditProfile={onOpenEditProfile}
      />
    </div>
  );
}
