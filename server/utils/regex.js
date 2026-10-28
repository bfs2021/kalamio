// bcrypt only reads the first 72 bytes of a password. Cap the UTF-8 length so
// characters beyond the limit never silently become part of the hash contract.
const BCRYPT_MAX_BYTES = 72;

// Shared with server/validators/schemas.js so the Zod gate and the controller
// agree on what a usable address looks like. The OTP email is the real check.
export const emailRegex = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/; // regex for email
// The `u` flag makes `.` count code points, so an emoji is one character of the
// 64 rather than two UTF-16 units. The byte cap below still guards bcrypt.
export const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,64}$/u; // regex for password

export function isValidPassword(password) {
    return (
        typeof password === 'string' &&
        passwordRegex.test(password) &&
        Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_BYTES
    );
}
