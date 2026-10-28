// bcrypt only reads the first 72 bytes of a password. Cap the UTF-8 length so
// characters beyond the limit never silently become part of the hash contract.
const BCRYPT_MAX_BYTES = 72;

export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/; // regex for email
export const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,64}$/; // regex for password

export function isValidPassword(password) {
    return (
        typeof password === 'string' &&
        passwordRegex.test(password) &&
        Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_BYTES
    );
}
