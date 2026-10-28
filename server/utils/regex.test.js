import { describe, it, expect } from 'vitest';
import { emailRegex, passwordRegex } from './regex.js';

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
