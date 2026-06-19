import { useEffect, useRef } from "react";
import {
  User as UserIcon,
  Bell,
  BellOff,
  Sparkles,
  UsersRound,
  LayoutGrid,
  LogOut,
  Plus,
  Check,
  ChevronRight,
} from "lucide-react";
import { Avatar } from "../profile/Avatar";
import { useAccounts } from "../../features/accounts/useAccounts";
import { switchAccount } from "../../features/accounts/accountStore";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useNotificationSettings } from "../../features/notifications";
import { useTheme } from "../../features/theme";

// Theme-aware via zinc CSS vars (override per [data-theme]) so the menu reads
// correctly on both dark and light backgrounds.
const ROW_BG_HOVER = "var(--color-zinc-800)";

function MenuItem({ icon, label, hint, trailing, danger, onClick, m, navOnRight = true }) {
  const labelColor = danger ? "#f87171" : "var(--color-zinc-100)";
  const tileBg = danger ? "rgba(248,113,113,0.10)" : "var(--color-zinc-800)";
  const tileBorder = danger ? "rgba(248,113,113,0.18)" : "var(--color-zinc-700)";
  const tileColor = danger ? "#f87171" : "var(--color-zinc-400)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 rounded-xl text-left"
      style={{
        minHeight: m ? 52 : 44,
        color: labelColor,
        transition: "background-color .12s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? "rgba(248,113,113,0.08)" : ROW_BG_HOVER; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span
        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: tileBg, border: `1px solid ${tileBorder}`, color: tileColor }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {hint && <span className="block text-[11px] text-zinc-500 leading-tight mt-0.5">{hint}</span>}
      </span>
      {trailing}
      {!trailing && navOnRight && (
        <ChevronRight size={15} className="text-zinc-600 shrink-0" />
      )}
    </button>
  );
}

function Toggle({ on }) {
  return (
    <span
      className="relative shrink-0 rounded-full"
      style={{ width: 40, height: 23, background: on ? "var(--color-lime-400)" : "var(--color-zinc-600)" }}
      aria-hidden
    >
      <span
        className="absolute top-0.5 rounded-full bg-white"
        style={{ width: 19, height: 19, left: on ? 18 : 2 }}
      />
    </span>
  );
}

function Badge({ tone = "zinc", children }) {
  const tones = {
    amber: ["rgba(251,191,36,0.12)", "#fbbf24"],
    lime: ["rgba(var(--accent-rgb),0.12)", "var(--color-lime-400)"],
    zinc: ["var(--color-zinc-800)", "var(--color-zinc-400)"],
  };
  const [bg, color] = tones[tone] || tones.zinc;
  return (
    <span
      className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md"
      style={{ background: bg, color }}
    >
      {children}
    </span>
  );
}

function themeLabel(pref) {
  if (pref === "light") return "Светлая";
  if (pref === "system") return "Системная";
  return "Тёмная";
}

function MenuBody({
  m,
  myProfile,
  isAdmin,
  notifEnabled,
  onToggleNotif,
  onAction,
  onClose,
}) {
  const { accounts, activeId } = useAccounts(true);
  const { preference } = useTheme();

  return (
    <div className="flex flex-col py-2">
      {/* identity row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Avatar
          url={myProfile?.avatar_thumb_url}
          initials={(myProfile?.display_name || myProfile?.name || "?").slice(0, 1).toUpperCase()}
          size={m ? 48 : 44}
          online
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-zinc-100 truncate">
            {myProfile?.display_name || myProfile?.name || "—"}
          </div>
          {myProfile?.email && (
            <div className="text-xs text-zinc-500 truncate">{myProfile.email}</div>
          )}
        </div>
      </div>

      <div style={{ height: 1, background: "var(--color-zinc-700)", margin: "4px 8px" }} />

      <MenuItem
        m={m}
        icon={<UserIcon size={17} />}
        label="Мой профиль"
        hint="Имя, фото, статус"
        onClick={() => { onAction("profile"); onClose(); }}
      />

      <MenuItem
        m={m}
        icon={notifEnabled ? <Bell size={17} /> : <BellOff size={17} />}
        label="Уведомления"
        hint={notifEnabled ? "Включены" : "Сейчас выключены"}
        trailing={<Toggle on={notifEnabled} />}
        onClick={() => onToggleNotif()}
        navOnRight={false}
      />

      <MenuItem
        m={m}
        icon={<Sparkles size={17} />}
        label="Оформление"
        trailing={<Badge tone="zinc">{themeLabel(preference)}</Badge>}
        onClick={() => { onAction("profile-appearance"); onClose(); }}
      />

      <MenuItem
        m={m}
        icon={<UsersRound size={17} />}
        label="Создать группу"
        onClick={() => { onAction("group"); onClose(); }}
      />

      {isAdmin && (
        <MenuItem
          m={m}
          icon={<LayoutGrid size={16} />}
          label="Дашборд основателя"
          onClick={() => { onAction("dashboard"); onClose(); }}
        />
      )}

      <div style={{ height: 1, background: "var(--color-zinc-700)", margin: "4px 8px" }} />
      <div className="px-3 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
        Аккаунты
      </div>

      {accounts.map((a) => {
        const isActive = a.user_id === activeId;
        return (
          <button
            key={a.user_id}
            type="button"
            className="w-full flex items-center gap-3 px-3 rounded-xl text-left"
            style={{
              minHeight: m ? 50 : 44,
              transition: "background-color .12s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = ROW_BG_HOVER; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            onClick={() => {
              if (!isActive) switchAccount(a.user_id);
              onClose();
            }}
          >
            <Avatar
              url={a.avatar_url}
              initials={(a.display_name || "?").slice(0, 1).toUpperCase()}
              size={m ? 36 : 32}
            />
            <span className="flex-1 text-sm text-zinc-200 truncate">{a.display_name}</span>
            {a.unread > 0 && (
              <span
                className="text-[11px] font-bold px-1.5 rounded-full inline-flex items-center justify-center min-w-[20px] h-5"
                style={{ background: "var(--color-lime-400)", color: "#18181b" }}
              >
                {a.unread > 99 ? "99+" : a.unread}
              </span>
            )}
            {a.needs_login && <Badge tone="amber">вход</Badge>}
            {isActive && <Check size={16} className="text-lime-400 shrink-0" />}
          </button>
        );
      })}

      <MenuItem
        m={m}
        icon={<Plus size={17} />}
        label="Добавить аккаунт"
        onClick={() => { onAction("add-account"); onClose(); }}
        navOnRight={false}
      />

      <div style={{ height: 1, background: "var(--color-zinc-700)", margin: "4px 8px" }} />

      <MenuItem
        m={m}
        icon={<LogOut size={16} />}
        label="Выйти"
        danger
        onClick={() => { onAction("logout"); onClose(); }}
        navOnRight={false}
      />
    </div>
  );
}

export function AccountMenu({
  open,
  onClose,
  anchorRef,
  myProfile,
  isAdmin,
  onAction,
}) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const popoverRef = useRef(null);
  const { settings, setDnd } = useNotificationSettings();

  const notifEnabled = !settings.dnd;
  const handleToggleNotif = () => setDnd(notifEnabled);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const t = e.target;
      if (anchorRef?.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      >
        <div
          ref={popoverRef}
          className="relative w-full max-h-[88vh] overflow-hidden bg-zinc-900/95 border-t border-zinc-800/80 shadow-2xl animate-sheetUp flex flex-col"
          style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <span className="block h-1 w-10 rounded-full bg-zinc-700/70" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-3"
               style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <MenuBody
              m
              myProfile={myProfile}
              isAdmin={isAdmin}
              notifEnabled={notifEnabled}
              onToggleNotif={handleToggleNotif}
              onAction={onAction}
              onClose={onClose}
            />
          </div>
        </div>
      </div>
    );
  }

  // Desktop popover
  return (
    <div
      ref={popoverRef}
      className="absolute z-40 left-3 right-3 top-full mt-2 rounded-2xl border border-zinc-800/80 overflow-hidden flex flex-col animate-popIn"
      style={{
        background: "color-mix(in oklab, var(--color-zinc-900) 97%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.7)",
        maxHeight: "min(70vh, 520px)",
      }}
      role="menu"
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-1">
        <MenuBody
          myProfile={myProfile}
          isAdmin={isAdmin}
          notifEnabled={notifEnabled}
          onToggleNotif={handleToggleNotif}
          onAction={onAction}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
