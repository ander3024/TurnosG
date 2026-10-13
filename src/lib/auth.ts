import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { createToken, verifyToken } from "./jwt";
import type { JWTPayload } from "./jwt";

// Re-export for convenience
export { createToken, verifyToken };
export type { JWTPayload };

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: parseInt(payload.sub) },
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  if (!user || !user.active) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Forbidden");
  return user;
}

/**
 * Admin gate for server pages. requireAdmin() throws, which suits API routes;
 * a page needs a redirect instead. Call it at the top of the page itself, not
 * in a layout: Partial Rendering means layouts don't re-run on navigation, so
 * a layout check would not run on every route change.
 */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return user;
}
