// Shared form validation for the auth pages.
// Keep these permissive: the server and the OTP email are the real checks.

// Only catches obvious typos (missing @ / dot / whitespace). The old pattern
// blocked plus-addressing (user+tag@x.com) and TLDs longer than 3 chars
// (.online, .photography).
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// 6-64 characters with at least one digit, one lowercase and one uppercase
// letter. bcrypt only reads the first 72 bytes, so 64 is a safe ceiling that
// still accepts long password-manager passwords.
export const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,64}$/;
