// RBAC roles for the UI — mirrors backend core/permissions.py.

export const ROLES = ["user", "moderator", "admin", "owner"];

const RANK = { user: 0, moderator: 1, admin: 2, owner: 3 };

export const ROLE_LABELS = {
  user: "Пользователь",
  moderator: "Модератор",
  admin: "Админ",
  owner: "Владелец",
};

// Badge colours (hex/var) per role for the admin UI.
export const ROLE_BADGE = {
  user: { bg: "color-mix(in oklab, var(--color-zinc-700) 40%, transparent)", fg: "var(--color-zinc-300)" },
  moderator: { bg: "rgba(56,189,248,0.14)", fg: "#38bdf8" },
  admin: { bg: "rgba(var(--accent-rgb),0.15)", fg: "var(--color-lime-400)" },
  owner: { bg: "rgba(251,191,36,0.16)", fg: "#fbbf24" },
};

export function roleRank(r) {
  return RANK[r] ?? 0;
}

// Whether actor may set target (currently targetRole) to newRole.
export function canAssign(actorRole, targetRole, newRole) {
  if (RANK[newRole] === undefined) return false;
  const a = roleRank(actorRole);
  return a > roleRank(targetRole) && a > roleRank(newRole);
}

// Roles `actorRole` may assign to a target currently at `targetRole`.
export function assignableRoles(actorRole, targetRole) {
  return ROLES.filter((r) => canAssign(actorRole, targetRole, r));
}
