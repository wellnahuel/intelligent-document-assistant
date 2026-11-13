/**
 * Best-effort client address for rate limiting. The forwarding headers are
 * only trustworthy behind a proxy that overwrites them; this app is local
 * development only, and the email bucket still limits a single account when
 * the address is unknown or spoofed.
 */
export function getClientIp(headers: {
  get(name: string): string | null;
}): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (forwarded) {
    return forwarded;
  }

  const realIp = headers.get("x-real-ip")?.trim();

  return realIp && realIp.length > 0 ? realIp : "unknown";
}
