import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A path no route owns: rewriting here renders the branded root 404 with a real 404 status.
const NOWHERE = "/__not-found__";

/**
 * Runs before routing, only for the matchers below:
 *  - malformed percent-encoding in the dynamic sections (e.g. /camp/%E0%A4%A) would otherwise
 *    get Next's bare "400 Bad Request" page; show the friendly 404 instead.
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

  try {
    decodeURIComponent(pathname);
  } catch {
    return NextResponse.rewrite(new URL(NOWHERE, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/sprites/_preview.html", "/styleguide", "/camp/:path*", "/board/:path*", "/character/:path*"],
};
