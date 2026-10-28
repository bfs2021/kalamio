import { describe, it, expect } from 'vitest';
import { signupSchema, forgotPasswordSchema } from './schemas.js';

const signup = (email) =>
    signupSchema.safeParse({ fullname: 'Jo Bloggs', email, password: 'Aa1abcdef' });

describe('email fields share the controller rule', () => {
    it.each([
        'jo+news@gmail.com',
        'jo@site.info',
        'jo@kalamio.studio',
        "o'brien@example.ie",
        'user!tag@example.com', // RFC-valid local part Zod's own email() rejects
    ])('signup accepts %s', (email) => {
        expect(signup(email).success).toBe(true);
    });

    it.each(['jo@gmail', 'jo gmail.com', 'jo@@gmail.com', '@gmail.com', ''])(
        'signup still rejects %s',
        (email) => {
            expect(signup(email).success).toBe(false);
        }
    );

    it('forgot-password uses the same rule', () => {
        expect(forgotPasswordSchema.safeParse({ email: 'user!tag@example.com' }).success).toBe(true);
        expect(forgotPasswordSchema.safeParse({ email: 'jo@gmail' }).success).toBe(false);
    });
});
