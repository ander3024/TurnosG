import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "beta-turnos-secret-change-in-production-2026"
);
const TTL = "2h"; // Session expires after 2h of inactivity

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  name: string;
}

export async function createToken(user: {
  id: number;
  email: string;
  role: string;
  name: string;
}) {
  return new SignJWT({
    sub: String(user.id),
    email: user.email,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/** Renew a token with a fresh expiration (sliding session) */
export async function renewToken(payload: JWTPayload): Promise<string | null> {
  try {
    return new SignJWT({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(TTL)
      .sign(SECRET);
  } catch {
    return null;
  }
}
