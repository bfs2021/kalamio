// Shared form validation for the auth pages.
// Keep these permissive: the server and the OTP email are the real checks.

// bcrypt only reads the first 72 bytes of a password. Keep the client-side
// check consistent with server/utils/regex.js.
const BCRYPT_MAX_BYTES = 72;

// Only catches obvious typos (missing @ / dot / whitespace). The old pattern
// blocked plus-addressing (user+tag@x.com) and TLDs longer than 3 chars
// (.online, .photography).
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// 6-64 characters with at least one digit, one lowercase and one uppercase
// letter. bcrypt only reads the first 72 bytes, so the byte ceiling below keeps
// long password-manager passwords honest.
export const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,64}$/;

export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    passwordRegex.test(password) &&
    new TextEncoder().encode(password).length <= BCRYPT_MAX_BYTES
  );
}
