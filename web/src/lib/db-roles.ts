// Pure helpers describing the per-role database logins (no server-only import, unit-testable).
// Login names and passwords come from env vars only; see .env.example.

export type DbLogin = "web" | "auth" | "player" | "moderator" | "admin";

export const DB_LOGINS: readonly DbLogin[] = ["web", "auth", "player", "moderator", "admin"];

/** Env var suffix per login: PD_DB_USER_<SUFFIX> / PD_DB_PWD_<SUFFIX>. */
export const LOGIN_SUFFIX: Record<DbLogin, string> = {
  web: "WEB",
  auth: "AUTH",
  player: "PLAYER",
  moderator: "MODERATOR",
  admin: "ADMIN",
};

/** Pool size: the web pool serves every page read, the others are small. */
export const POOL_LIMIT: Record<DbLogin, number> = {
  web: 10,
  auth: 5,
  player: 5,
  moderator: 5,
  admin: 5,
};

export type AppRole = "player" | "moderator" | "admin";

/** The write login for a set of app roles: highest privilege wins; none means no write access. */
export function writeLoginForRoles(roles: readonly AppRole[]): Exclude<DbLogin, "web" | "auth"> | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("moderator")) return "moderator";
  if (roles.includes("player")) return "player";
  return null;
}

/** The login a signed-in viewer's reads use: the same mapping as writes. No role at all means "web" (anonymous). */
export function readLoginForRoles(roles: readonly AppRole[]): Exclude<DbLogin, "auth"> {
  return writeLoginForRoles(roles) ?? "web";
}
