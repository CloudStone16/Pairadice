import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A path no route owns: rewriting here renders the branded root 404 with a real 404 status.
const NOWHERE = "/__not-found__";

// Optimistic gate only: it checks that a session cookie EXISTS, never that it is valid.
// The pages (requireUser / requireRole) stay the authority.
const SESSION_ONLY = new Set(["/party", "/friends", "/character", "/mod", "/admin"]);
const needsSession = (pathname: string) => SESSION_ONLY.has(pathname.replace(/\/+$/, "") || "/");
const hasSessionCookie = (request: NextRequest) =>
  request.cookies.has("pd_session") || request.cookies.has("__Host-pd_session");
// Mirrors isDevAuthEnabled() (that module is server-only and cannot be imported here).
const devAuthOn = () => process.env.NODE_ENV === "development" && process.env.PAIRADICE_DEV_AUTH === "1";

/**
 * Runs before routing, only for the matchers below:
 *  - malformed percent-encoding in the dynamic sections (e.g. /camp/%E0%A4%A) would otherwise
 *    get Next's bare "400 Bad Request" page; show the friendly 404 instead.
 *  - signed-out visits to account-only pages are sent to /signin?next=... (optimistic, see above).
 *  - the generated sprite sheet preview and the style guide are dev tools; they do not exist in production
 *    (the style guide page also calls notFound() itself).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/sprites/_preview.html" || pathname === "/styleguide") {
    return process.env.NODE_ENV === "production"
      ? NextResponse.rewrite(new URL(NOWHERE, request.url))
      : NextResponse.next();
  }

  if (needsSession(pathname) && !hasSessionCookie(request) && !devAuthOn()) {
    const url = new URL("/signin", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    decodeURIComponent(pathname);
  } catch {
    return NextResponse.rewrite(new URL(NOWHERE, request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Explicit allow-list: static assets, /sprites (except the preview) and /_next never reach the proxy.
  matcher: [
    "/sprites/_preview.html",
    "/styleguide",
    "/camp/:path*",
    "/board/:path*",
    "/character/:path*",
    "/party",
    "/friends",
    "/mod",
    "/admin",
  ],
};
