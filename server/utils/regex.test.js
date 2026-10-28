import { describe, it, expect } from 'vitest';
import { emailRegex, passwordRegex, isValidPassword } from './regex.js';

describe('emailRegex', () => {
    it.each([
        'jo+news@gmail.com',
        'jo@site.info',
        'jo@kalamio.studio',
        "o'brien@example.ie",
        'name.tag@sub.example.co.uk',
    ])('accepts valid address %s', (email) => {
        expect(emailRegex.test(email)).toBe(true);
    });

    it.each([
        'jo@gmail',
        'jo gmail.com',
        'jo@@gmail.com',
        '@gmail.com',
        'jo@.com',
        '',
    ])('rejects obvious typo %s', (email) => {
        expect(emailRegex.test(email)).toBe(false);
    });

    it('rejects a 10,000-character dotted string quickly', () => {
        const dotted = `${'a'.repeat(4999)}@${'.'.repeat(5000)}.com`;
        const started = performance.now();
        expect(emailRegex.test(dotted)).toBe(false);
        expect(performance.now() - started).toBeLessThan(100);
    });
});

describe('passwordRegex', () => {
    it('accepts a 40-character password from a password manager', () => {
        expect(passwordRegex.test(`Aa1${'x'.repeat(37)}`)).toBe(true);
    });

    it('accepts the 64-character maximum', () => {
        expect(passwordRegex.test(`Aa1${'x'.repeat(61)}`)).toBe(true);
    });

    it('rejects a password longer than 64 characters', () => {
        expect(passwordRegex.test(`Aa1${'x'.repeat(62)}`)).toBe(false);
    });

    it('counts an emoji as one character, not two UTF-16 units', () => {
        const password = `Aa1${'x'.repeat(60)}😀`; // 64 code points, 67 bytes
        expect([...password].length).toBe(64);
        expect(Buffer.byteLength(password, 'utf8')).toBe(67);
        expect(passwordRegex.test(password)).toBe(true);
        expect(isValidPassword(password)).toBe(true);
    });

    it('rejects 65 code points even when an emoji is present', () => {
        expect(passwordRegex.test(`Aa1${'x'.repeat(61)}😀`)).toBe(false);
    });

    it.each([
        'Aa1abc', // 6 characters, accepted minimum
        'Aa1abcde',
    ])('accepts short password %s', (password) => {
        expect(passwordRegex.test(password)).toBe(true);
    });

    it.each([
        'Aabcdef', // no digit
        'A1BCDEF', // no lowercase
        'a1bcdef', // no uppercase
        'Aa1', // below the minimum
    ])('rejects password %s', (password) => {
        expect(passwordRegex.test(password)).toBe(false);
    });
});

describe('isValidPassword', () => {
    it('accepts a password exactly at the bcrypt 72-byte limit', () => {
        const password = `Aa1${'é'.repeat(34)}b`; // 3 + 68 + 1 = 72 bytes
        expect(Buffer.byteLength(password, 'utf8')).toBe(72);
        expect(isValidPassword(password)).toBe(true);
    });

    it('rejects a password above the bcrypt 72-byte limit', () => {
        const password = `Aa1${'é'.repeat(34)}bb`; // 73 bytes
        expect(Buffer.byteLength(password, 'utf8')).toBe(73);
        expect(isValidPassword(password)).toBe(false);
    });

    it('still applies the character rules', () => {
        expect(isValidPassword('Aa1abcdef')).toBe(true);
        expect(isValidPassword('a1bcdef')).toBe(false);
        expect(isValidPassword(undefined)).toBe(false);
    });
});
