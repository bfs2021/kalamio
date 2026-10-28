// Shared form validation for the auth pages.
// Keep these permissive: the server and the OTP email are the real checks.

// bcrypt only reads the first 72 bytes of a password. Keep the client-side
// check consistent with server/utils/regex.js.
const BCRYPT_MAX_BYTES = 72;

// Only catches obvious typos (missing @ / dot / whitespace). The old pattern
// blocked plus-addressing (user+tag@x.com) and TLDs longer than 3 chars
// (.online, .photography).
export const emailRegex = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;

// 6-64 characters with at least one digit, one lowercase and one uppercase
// letter. bcrypt only reads the first 72 bytes, so the byte ceiling below keeps
// long password-manager passwords honest. The `u` flag makes `.` count code
// points, so an emoji is one character of the 64 rather than two.
export const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,64}$/u;

// One message for every page that shows this rule, so the wording cannot drift.
export const PASSWORD_ERROR =
  "Password should be 6 to 64 characters long with a number, one lowercase and one uppercase letter, and at most 72 UTF-8 bytes";

export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    passwordRegex.test(password) &&
    new TextEncoder().encode(password).length <= BCRYPT_MAX_BYTES
  );
}
