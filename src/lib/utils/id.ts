/**
 * Generate a prefixed unique ID.
 * Format: {prefix}-{random12chars}
 */
export function generateId(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let random = "";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (const byte of bytes) {
    random += chars[byte % chars.length];
  }
  return `${prefix}-${random}`;
}
