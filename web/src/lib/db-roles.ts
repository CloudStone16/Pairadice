import "server-only";

/**
 * Which MySQL login acts for a request. RBAC is enforced by the database:
 *  - "web":       anonymous / public browsing (pd_web, read-only role).
 *  - "auth":      sign-up, login and session lookup only (pd_auth).
 *  - "player" | "moderator" | "admin": signed-in users, by their highest in-app role.
 */
export type DbRole = "web" | "auth" | "player" | "moderator" | "admin";

export interface DbRoleEnv {
  readonly userVar: string;
  readonly pwdVar: string;
  readonly defaultUser: string;
}

export const DB_ROLE_ENV: Readonly<Record<DbRole, DbRoleEnv>> = {
  web: { userVar: "PD_WEB_USER", pwdVar: "PD_WEB_PWD", defaultUser: "pd_web" },
  auth: { userVar: "PD_AUTH_USER", pwdVar: "PD_AUTH_PWD", defaultUser: "pd_auth" },
  player: { userVar: "PD_API_USER", pwdVar: "PD_API_PWD", defaultUser: "pd_api" },
  moderator: { userVar: "PD_MOD_USER", pwdVar: "PD_MOD_PWD", defaultUser: "pd_mod" },
  admin: { userVar: "PD_ADMIN_USER", pwdVar: "PD_ADMIN_PWD", defaultUser: "pd_admin" },
};

/**
 * Map in-app roles (user_role.role: 'player' | 'moderator' | 'admin') to the
 * highest DB role. A signed-in user with no (or unknown) roles is "player".
 */
export function roleForAppRoles(appRoles: readonly string[]): DbRole {
  if (appRoles.includes("admin")) return "admin";
  if (appRoles.includes("moderator")) return "moderator";
  return "player";
}
