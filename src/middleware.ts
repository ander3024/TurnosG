import { NextRequest, NextResponse } from "next/server";
import { verifyToken, renewToken } from "@/lib/jwt";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/forgot-password",
  "/reset-password",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths, static files, and PWA assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icons") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/logo") ||
    pathname === "/offline.html"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.cookies.set("token", "", { maxAge: 0, path: "/" });
    return response;
  }

  // Admin routes protection
  if (pathname.startsWith("/admin") && payload.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Sliding session: renew token on every request to reset the 2h inactivity timer
  const response = NextResponse.next();
  response.headers.set("x-user-id", payload.sub);
  response.headers.set("x-user-role", payload.role);
  response.headers.set("x-user-email", payload.email);

  // Renew token (reset expiration) on every navigation/API call
  const newToken = await renewToken(payload);
  if (newToken) {
    response.cookies.set("token", newToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7200, // 2h
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest).*)"],
};
