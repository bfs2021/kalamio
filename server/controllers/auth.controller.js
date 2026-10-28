import crypto from 'crypto';
import bcrypt from 'bcrypt';
import User, { generateAvatar } from '../Schema/User.js';
import LoginAttempt from '../Schema/LoginAttempt.js';
import AuthCode from '../Schema/AuthCode.js';
import passport from 'passport';
import { emailRegex, isValidPassword } from '../utils/regex.js';
import { generateUsername } from '../utils/helpers.js';
import { isGoogleAuthEnabled } from '../strategies/google.strategy.js';
import { generateTokenPair, generateAccessToken, verifyRefreshToken, verifyAccessToken, hashToken, safeEqual } from '../services/token.service.js';
import { generateOtp, verifyOtp } from '../services/otp.service.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.service.js';
import { AUTH } from '../constants/auth.constants.js';
import { ERRORS } from '../constants/error-messages.js';
import audit from '../middleware/auditLogger.js';
import { setRefreshCookie, clearRefreshCookie, readRefreshToken, bodyRefreshToken } from '../utils/authCookie.js';

// ─────────────────────────────────────────────
// Refresh sessions (per-device)
// ─────────────────────────────────────────────

/**
 * Create a new per-device refresh session for a user and return its token pair.
 * Each login/OAuth-exchange gets its own session entry, so signing in on one device never logs out
 * another. Sessions are capped — beyond the cap the least-recently-used entry is dropped.
 */
const createUserSession = async (user_id) => {
    const sid = crypto.randomUUID();
    const tokens = generateTokenPair(user_id, sid);
    const now = new Date();
    const entry = { sid, token_hash: hashToken(tokens.refresh_token), created_at: now, last_used_at: now };

    // Atomic push-sort-slice: appends the new session and trims to the cap (most recently used kept)
    // in ONE document update — two devices logging in simultaneously can't clobber each other the way
    // a read-modify-write of the whole array could.
    await User.updateOne(
        { _id: user_id },
        { $push: { refresh_sessions: {
            $each: [entry],
            $sort: { last_used_at: -1 },
            $slice: AUTH.MAX_REFRESH_SESSIONS,
        } } }
    );

    return tokens;
};

// ─────────────────────────────────────────────
// Signup — creates unverified user, sends OTP
// ─────────────────────────────────────────────
export const signup = async (req, res) => {
    try {
        let { fullname, email, password } = req.body;

        // Input validation
        if (!fullname || fullname.length < 3) {
            return res.status(422).json({ error: ERRORS.FULLNAME_TOO_SHORT });
        }
        if (!email || !email.length) {
            return res.status(422).json({ error: ERRORS.EMAIL_REQUIRED });
        }
        if (!emailRegex.test(email)) {
            return res.status(422).json({ error: ERRORS.EMAIL_INVALID });
        }
        if (!isValidPassword(password)) {
            return res.status(422).json({ error: ERRORS.PASSWORD_WEAK });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ "personal_info.email": email.toLowerCase() });
        if (existingUser) {
            // If user exists but is unverified, allow re-registration
            if (!existingUser.personal_info.isEmailVerified) {
                // Update the existing unverified user with new data
                const hashed_password = await bcrypt.hash(password, AUTH.SALT_ROUNDS);
                const username = await generateUsername(email);

                existingUser.personal_info.fullname = fullname;
                existingUser.personal_info.password = hashed_password;
                existingUser.personal_info.username = username;
                existingUser.personal_info.profile_img = generateAvatar(fullname);
                await existingUser.save();

                // Generate and send OTP
                const otp = await generateOtp(email.toLowerCase());
                await sendVerificationEmail(email, otp);

                return res.status(200).json({
                    message: "Verification OTP sent to your email",
                    email: email.toLowerCase(),
                });
            }
            return res.status(409).json({ error: ERRORS.EMAIL_EXISTS });
        }

        // Hash password and create user
        const hashed_password = await bcrypt.hash(password, AUTH.SALT_ROUNDS);
        const username = await generateUsername(email);

        const user = new User({
            personal_info: {
                fullname,
                email: email.toLowerCase(),
                password: hashed_password,
                username,
                isEmailVerified: false,
                profile_img: generateAvatar(fullname),
            },
            provider: 'local',
        });

        await user.save();

        // Generate and send OTP
        const otp = await generateOtp(email.toLowerCase());
        await sendVerificationEmail(email, otp);

        return res.status(200).json({
            message: "Verification OTP sent to your email",
            email: email.toLowerCase(),
        });

    } catch (err) {
        (req.log || console).error({ err }, '[Signup Error]');

        if (err.code === 11000) {
            return res.status(409).json({ error: ERRORS.EMAIL_EXISTS });
        }
        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Verify Email — validates OTP, returns tokens
// ─────────────────────────────────────────────
export const verifyEmail = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(422).json({ error: ERRORS.OTP_REQUIRED });
        }

        // Verify the OTP
        await verifyOtp(email.toLowerCase(), otp);

        // Mark email as verified
        const user = await User.findOneAndUpdate(
            { "personal_info.email": email.toLowerCase() },
            { "personal_info.isEmailVerified": true },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: ERRORS.USER_NOT_FOUND });
        }

        // Generate tokens and store hashed refresh token
        const tokens = await createUserSession(user._id);
        setRefreshCookie(res, tokens.refresh_token);

        return res.status(200).json({
            _id: user._id,
            access_token: tokens.access_token,
            // Omitted for cookie clients (token lives only in the httpOnly cookie); kept for legacy ones.
            refresh_token: bodyRefreshToken(req, tokens.refresh_token),
            profile_img: user.personal_info.profile_img,
            username: user.personal_info.username,
            fullname: user.personal_info.fullname,
        });

    } catch (err) {
        (req.log || console).error({ err }, '[Verify Email Error]');
        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Resend OTP — with 60-second cooldown
// ─────────────────────────────────────────────
export const resendOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(422).json({ error: ERRORS.EMAIL_REQUIRED });
        }

        const user = await User.findOne({ "personal_info.email": email.toLowerCase() });

        if (!user) {
            return res.status(404).json({ error: ERRORS.USER_NOT_FOUND });
        }

        if (user.personal_info.isEmailVerified) {
            return res.status(400).json({ error: ERRORS.EMAIL_ALREADY_VERIFIED });
        }

        // Generate and send new OTP (cooldown enforced inside generateOtp)
        const otp = await generateOtp(email.toLowerCase());
        await sendVerificationEmail(email, otp);

        return res.status(200).json({
            message: "Verification OTP resent to your email",
        });

    } catch (err) {
        (req.log || console).error({ err }, '[Resend OTP Error]');
        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Signin — with brute-force protection
// ─────────────────────────────────────────────
export const signin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(422).json({ error: ERRORS.INVALID_CREDENTIALS });
        }

        const identifier = email.toLowerCase().trim();

        // Check brute-force lockout
        const recentAttempts = await LoginAttempt.countDocuments({ identifier });
        if (recentAttempts >= AUTH.MAX_LOGIN_ATTEMPTS) {
            return res.status(429).json({ error: ERRORS.ACCOUNT_LOCKED });
        }

        // Find user by email OR username
        const user = await User.findOne({
            $or: [
                { "personal_info.email": identifier },
                { "personal_info.username": identifier },
            ]
        }).select('+personal_info.password');

        if (!user) {
            // Record failed attempt
            await LoginAttempt.create({
                identifier,
                expiresAt: new Date(Date.now() + AUTH.LOGIN_LOCKOUT_MS),
            });
            return res.status(401).json({ error: ERRORS.INVALID_CREDENTIALS });
        }

        // Check if this is a Google-only account
        if (user.google_auth) {
            return res.status(403).json({ error: ERRORS.LOCAL_ACCOUNT_EXISTS });
        }

        // Check if email is verified
        if (!user.personal_info.isEmailVerified) {
            return res.status(403).json({
                error: ERRORS.EMAIL_NOT_VERIFIED,
                email: user.personal_info.email,
                needsVerification: true,
            });
        }

        // Compare password
        const isPasswordValid = await bcrypt.compare(password, user.personal_info.password);

        if (!isPasswordValid) {
            // Record failed attempt
            await LoginAttempt.create({
                identifier,
                expiresAt: new Date(Date.now() + AUTH.LOGIN_LOCKOUT_MS),
            });

            const attemptsLeft = AUTH.MAX_LOGIN_ATTEMPTS - (recentAttempts + 1);
            return res.status(401).json({
                error: attemptsLeft > 0
                    ? `${ERRORS.INVALID_CREDENTIALS} (${attemptsLeft} attempts remaining)`
                    : ERRORS.ACCOUNT_LOCKED,
            });
        }

        // Success — clear all login attempts for this identifier
        await LoginAttempt.deleteMany({ identifier });
        audit.log(req, 'LOGIN_SUCCESS', { email: identifier });

        // Generate tokens and store hashed refresh token
        const tokens = await createUserSession(user._id);
        setRefreshCookie(res, tokens.refresh_token);

        return res.status(200).json({
            _id: user._id,
            access_token: tokens.access_token,
            // Omitted for cookie clients (token lives only in the httpOnly cookie); kept for legacy ones.
            refresh_token: bodyRefreshToken(req, tokens.refresh_token),
            profile_img: user.personal_info.profile_img,
            username: user.personal_info.username,
            fullname: user.personal_info.fullname,
        });

    } catch (err) {
        (req.log || console).error({ err }, '[Signin Error]');
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Google Auth — Passport OAuth 2.0 redirect flow
// ─────────────────────────────────────────────

// Google sign-in is optional — without credentials there's no 'google' strategy to run.
const redirectGoogleDisabled = (res) => res.redirect(
    `${process.env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(ERRORS.GOOGLE_AUTH_DISABLED)}`
);

const authenticateGoogle = passport.authenticate('google', {
    scope: ['email', 'profile'],
    session: false,
});

/**
 * Step 1: Initiates Google OAuth — redirects user to Google consent screen.
 * GET /api/auth/google
 */
export const googleAuthRedirect = (req, res, next) => {
    if (!isGoogleAuthEnabled) return redirectGoogleDisabled(res);
    return authenticateGoogle(req, res, next);
};

/**
 * Step 2: Google callback — uses Passport's custom callback pattern
 * so we can handle errors/failures ourselves and always redirect
 * to the frontend (never to a backend route).
 * GET /api/auth/google/callback
 */
export const googleAuthCallback = (req, res, next) => {
    if (!isGoogleAuthEnabled) return redirectGoogleDisabled(res);
    passport.authenticate('google', { session: false }, async (err, user, info) => {
        const frontendUrl = process.env.FRONTEND_URL;

        try {
            // Passport error (strategy threw)
            if (err) {
                (req.log || console).error({ err }, '[Google Auth Error]');
                return res.redirect(
                    `${frontendUrl}/auth/callback?error=${encodeURIComponent(ERRORS.GOOGLE_AUTH_FAILED)}`
                );
            }

            // Authentication failed (e.g. email registered with password)
            if (!user) {
                const message = info?.message || ERRORS.GOOGLE_AUTH_FAILED;
                return res.redirect(
                    `${frontendUrl}/auth/callback?error=${encodeURIComponent(message)}`
                );
            }

            // Generate a short-lived, single-use authorization code
            // instead of passing tokens directly in the URL.
            const code = crypto.randomBytes(32).toString('hex');

            await AuthCode.create({
                code,
                userId: user._id,
                expiresAt: new Date(Date.now() + AUTH.AUTH_CODE_EXPIRY_MS),
            });

            // Redirect with ONLY the opaque code — no tokens in the URL
            return res.redirect(`${frontendUrl}/auth/callback?code=${code}`);

        } catch (error) {
            (req.log || console).error({ err: error }, '[Google Auth Callback Error]');
            return res.redirect(
                `${frontendUrl}/auth/callback?error=${encodeURIComponent(ERRORS.GOOGLE_AUTH_FAILED)}`
            );
        }
    })(req, res, next);
};

// ─────────────────────────────────────────────
// Exchange Auth Code — trades a one-time code for tokens
// ─────────────────────────────────────────────
export const exchangeAuthCode = async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(422).json({ error: 'Authorization code is required' });
        }

        // Find and delete the code atomically (single-use)
        const authCode = await AuthCode.findOneAndDelete({ code });

        if (!authCode) {
            return res.status(401).json({ error: 'Invalid or expired authorization code' });
        }

        // Check expiry (belt-and-suspenders — TTL index handles cleanup)
        if (authCode.expiresAt < new Date()) {
            return res.status(401).json({ error: 'Authorization code has expired' });
        }

        // Load the user
        const user = await User.findById(authCode.userId);
        if (!user) {
            return res.status(404).json({ error: ERRORS.USER_NOT_FOUND });
        }

        // Generate tokens and store hashed refresh token
        const tokens = await createUserSession(user._id);
        setRefreshCookie(res, tokens.refresh_token);

        return res.status(200).json({
            _id: user._id,
            access_token: tokens.access_token,
            // Omitted for cookie clients (token lives only in the httpOnly cookie); kept for legacy ones.
            refresh_token: bodyRefreshToken(req, tokens.refresh_token),
            profile_img: user.personal_info.profile_img,
            username: user.personal_info.username,
            fullname: user.personal_info.fullname,
        });

    } catch (err) {
        (req.log || console).error({ err }, '[Exchange Auth Code Error]');
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Forgot Password — sends reset OTP
// ─────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(422).json({ error: ERRORS.EMAIL_REQUIRED });
        }

        const user = await User.findOne({ "personal_info.email": email.toLowerCase() });

        // Always return success to prevent email enumeration
        if (!user || user.google_auth) {
            return res.status(200).json({ message: ERRORS.PASSWORD_RESET_SENT });
        }

        const otp = await generateOtp(email.toLowerCase());
        await sendPasswordResetEmail(email, otp);

        return res.status(200).json({ message: ERRORS.PASSWORD_RESET_SENT });

    } catch (err) {
        (req.log || console).error({ err }, '[Forgot Password Error]');
        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Reset Password — verifies OTP + updates password
// ─────────────────────────────────────────────
export const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(422).json({ error: "Email, OTP, and new password are required" });
        }

        if (!isValidPassword(newPassword)) {
            return res.status(422).json({ error: ERRORS.PASSWORD_WEAK });
        }

        // Verify the OTP
        await verifyOtp(email.toLowerCase(), otp);

        // Hash and update the password, invalidate all existing sessions
        const hashedPassword = await bcrypt.hash(newPassword, AUTH.SALT_ROUNDS);

        const user = await User.findOneAndUpdate(
            { "personal_info.email": email.toLowerCase() },
            {
                "personal_info.password": hashedPassword,
                $unset: { refreshToken: 1 },
                $set: { refresh_sessions: [] }, // password reset logs out every device
            }
        );

        if (!user) {
            return res.status(404).json({ error: ERRORS.USER_NOT_FOUND });
        }

        return res.status(200).json({ message: ERRORS.PASSWORD_RESET_SUCCESS });

    } catch (err) {
        (req.log || console).error({ err }, '[Reset Password Error]');
        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Refresh Token — returns new access token
// ─────────────────────────────────────────────
// Rotate a matched session forward under compare-and-swap on its token_hash — the write only lands
// if the current token_hash is still exactly what we read, so a concurrent refresh can't clobber us.
// The superseded token_hash is pushed into the grace-hash set (kept valid for the grace window), so
// every token issued within that window stays redeemable — a racing tab holding an older one is
// never misread as a replay. Expired grace hashes are pruned on each rotation. Returns the new pair,
// or null if the CAS lost (caller re-reads and re-evaluates).
const rotateSessionCAS = async (userId, session, now) => {
    const tokens = generateTokenPair(userId, session.sid);
    const graceHashes = (session.grace_hashes || [])
        .filter(g => new Date(g.exp) > now)
        .concat([{ hash: session.token_hash, exp: new Date(now.getTime() + AUTH.REFRESH_ROTATION_GRACE_MS) }]);
    const r = await User.updateOne(
        { _id: userId, refresh_sessions: { $elemMatch: { sid: session.sid, token_hash: session.token_hash } } },
        { $set: {
            'refresh_sessions.$.token_hash': hashToken(tokens.refresh_token),
            'refresh_sessions.$.grace_hashes': graceHashes,
            'refresh_sessions.$.last_used_at': now,
        } }
    );
    return r.matchedCount === 1 ? tokens : null;
};

// True if `th` is a still-valid grace hash for this session (recently superseded, not yet expired).
const matchesGrace = (session, th, now) =>
    (session.grace_hashes || []).some(g => new Date(g.exp) > now && safeEqual(th, g.hash));

// Small randomized backoff between CAS retries. Under a burst of concurrent same-token refreshes the
// losers would otherwise re-read and re-collide in lockstep; jitter spreads them so more win per round.
const casBackoff = (attempt) => new Promise(r => setTimeout(r, 4 + attempt * 8 + Math.floor(Math.random() * 12)));

// Send a freshly-rotated pair: set the httpOnly refresh cookie and return the access token (the
// refresh token is echoed in the body only for legacy, non-cookie clients).
const sendRotatedTokens = (req, res, tokens) => {
    setRefreshCookie(res, tokens.refresh_token);
    return res.status(200).json({
        access_token: tokens.access_token,
        refresh_token: bodyRefreshToken(req, tokens.refresh_token),
    });
};

export const refreshToken = async (req, res) => {
    try {
        // Cookie first (the new httpOnly source of truth), then the body (legacy clients + one-time
        // bootstrap migration of a pre-cookie localStorage token).
        const token = readRefreshToken(req);
        if (!token) {
            return res.status(401).json({ error: ERRORS.REFRESH_TOKEN_INVALID });
        }

        // Verify JWT signature + expiry
        const decoded = verifyRefreshToken(token);
        if (!decoded) {
            return res.status(401).json({ error: ERRORS.REFRESH_TOKEN_INVALID });
        }

        const th = hashToken(token);

        // ── Per-device session token (carries a sid) ────────────────────
        if (decoded.sid) {
            // Re-read + CAS in a retry loop: if a concurrent refresh wins the swap first, we re-evaluate
            // — the token we hold is now in the grace-hash set, so the "loser" becomes a clean grace hit
            // instead of an orphaned token that would later self-revoke the session.
            for (let attempt = 0; attempt < AUTH.REFRESH_CAS_MAX_RETRIES; attempt++) {
                const user = await User.findById(decoded.id).select('+refresh_sessions');
                if (!user) return res.status(401).json({ error: ERRORS.REFRESH_TOKEN_INVALID });
                const session = (user.refresh_sessions || []).find(s => s.sid === decoded.sid);
                if (!session) return res.status(401).json({ error: ERRORS.REFRESH_TOKEN_INVALID });

                const now = new Date();
                if (safeEqual(th, session.token_hash) || matchesGrace(session, th, now)) {
                    const tokens = await rotateSessionCAS(decoded.id, session, now);
                    if (tokens) return sendRotatedTokens(req, res, tokens);
                    await casBackoff(attempt); // lost the CAS — back off, then re-read and re-evaluate
                    continue;
                }

                // Neither the current token nor a still-valid grace hash → replay/theft signal.
                // Revoke the whole session so a stolen, rotated-out token can't be farmed.
                await User.updateOne({ _id: decoded.id }, { $pull: { refresh_sessions: { sid: session.sid } } });
                audit.log(req, 'REFRESH_TOKEN_REUSE', { sid: session.sid, userId: String(decoded.id) });
                return res.status(401).json({ error: ERRORS.REFRESH_TOKEN_INVALID });
            }
            // Exhausted retries while the token stayed VALID (current-or-grace) every time — i.e. we kept
            // losing the CAS to a storm of concurrent refreshes, NOT a reuse. Signal "retry", not "log
            // out": the client treats 5xx as transient and re-attempts, whereas a 401 here would nuke a
            // perfectly good session. The session is left intact.
            return res.status(503).json({ error: ERRORS.REFRESH_RETRY });
        }

        // ── Legacy single-session token (pre-sid deploys) → migrate ONCE ─────
        // We do NOT bcrypt-compare the raw JWT: bcrypt truncates at 72 bytes and every legacy token
        // for a user shares that prefix, so the compare is security-theatre. The already-verified JWT
        // signature (proves it was issued to this user) + a one-shot atomic claim of the legacy field
        // is the real guard.
        for (let attempt = 0; attempt < AUTH.REFRESH_CAS_MAX_RETRIES; attempt++) {
            const user = await User.findById(decoded.id).select('+refreshToken +refresh_sessions');
            if (!user) return res.status(401).json({ error: ERRORS.REFRESH_TOKEN_INVALID });
            const now = new Date();

            // Already migrated (this legacy token, within grace) — recover by rotating its session.
            // `migrated_from` is a NON-consuming marker (unlike prev_hash), so any number of concurrent
            // retries of the same legacy token all recover instead of racing one another out.
            const migrated = (user.refresh_sessions || []).find(s =>
                s.migrated_from && s.migrated_at
                && (now - new Date(s.migrated_at)) < AUTH.REFRESH_ROTATION_GRACE_MS
                && safeEqual(th, s.migrated_from));
            if (migrated) {
                const tokens = await rotateSessionCAS(decoded.id, migrated, now);
                if (tokens) return sendRotatedTokens(req, res, tokens);
                await casBackoff(attempt); // another retry rotated it first — re-read and rotate again
                continue;
            }

            if (!user.refreshToken) {
                return res.status(401).json({ error: ERRORS.REFRESH_TOKEN_INVALID });
            }

            // Atomic one-shot claim: mint a session ONLY while the legacy field is still present, and
            // $unset it in the SAME write, so a concurrent/duplicate legacy request can't mint a
            // second session. migrated_from = hash(this legacy token) makes the migration itself
            // recoverable for the grace window (lost response), handled by the branch above on retry.
            const sid = crypto.randomUUID();
            const tokens = generateTokenPair(decoded.id, sid);
            const entry = { sid, token_hash: hashToken(tokens.refresh_token), migrated_from: th, migrated_at: now, created_at: now, last_used_at: now };
            const r = await User.updateOne(
                { _id: decoded.id, refreshToken: user.refreshToken },
                { $unset: { refreshToken: 1 }, $push: { refresh_sessions: {
                    $each: [entry], $sort: { last_used_at: -1 }, $slice: AUTH.MAX_REFRESH_SESSIONS,
                } } }
            );
            if (r.modifiedCount === 1) {
                audit.log(req, 'LEGACY_REFRESH_MIGRATED', { userId: String(decoded.id) });
                return sendRotatedTokens(req, res, tokens);
            }
            // Lost the claim race to a concurrent request — back off, then loop to recover via migrated_from.
            await casBackoff(attempt);
        }
        // Exhausted retries mid-migration under contention (session exists but we kept losing the CAS).
        // Same reasoning as the sid path: transient, so tell the client to retry rather than log out.
        return res.status(503).json({ error: ERRORS.REFRESH_RETRY });

    } catch (err) {
        (req.log || console).error({ err }, '[Refresh Token Error]');
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Logout — invalidates refresh token
// ─────────────────────────────────────────────
export const logout = async (req, res) => {
    try {
        // Self-authenticating on the presented refresh token (works even when the access token has
        // already expired at sign-out time — a common case). Falls back to a Bearer access token for
        // older clients that don't send a refresh_token. The route has no verifyJWT so an expired
        // access token can't turn a sign-out into a 401 that skips revocation entirely.
        const refresh_token = readRefreshToken(req);
        // Always clear the browser's refresh cookie on sign-out, however we end up identifying the session.
        clearRefreshCookie(res);
        const decoded = refresh_token ? verifyRefreshToken(refresh_token) : null;

        if (decoded?.sid) {
            // Revoke exactly this device's session — possession of its refresh token is the auth.
            await User.updateOne(
                { _id: decoded.id },
                { $pull: { refresh_sessions: { sid: decoded.sid } } }
            );
            audit.log(req, 'LOGOUT', { userId: String(decoded.id) });
            return res.status(200).json({ message: "Logged out successfully" });
        }

        // Older client: identify via the Bearer access token and clear the legacy single-session field.
        const authHeader = req.headers['authorization'];
        const accessTok = authHeader && authHeader.split(' ')[1];
        const acc = accessTok ? verifyAccessToken(accessTok) : null;
        if (acc?.id) {
            await User.updateOne({ _id: acc.id }, { $unset: { refreshToken: 1 } });
        }

        audit.log(req, 'LOGOUT', acc?.id ? { userId: String(acc.id) } : {});
        return res.status(200).json({ message: "Logged out successfully" });

    } catch (err) {
        (req.log || console).error({ err }, '[Logout Error]');
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};

// ─────────────────────────────────────────────
// Change Password — for authenticated users
// ─────────────────────────────────────────────
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!isValidPassword(currentPassword) || !isValidPassword(newPassword)) {
            return res.status(422).json({ error: ERRORS.PASSWORD_WEAK });
        }

        const user = await User.findOne({ _id: req.user }).select('+personal_info.password');

        if (!user) {
            return res.status(404).json({ error: ERRORS.USER_NOT_FOUND });
        }

        if (user.google_auth) {
            return res.status(403).json({ error: ERRORS.GOOGLE_PASSWORD_CHANGE });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.personal_info.password);
        if (!isMatch) {
            return res.status(403).json({ error: ERRORS.CURRENT_PASSWORD_INCORRECT });
        }

        const hashedPassword = await bcrypt.hash(newPassword, AUTH.SALT_ROUNDS);
        // Update password and invalidate all other sessions
        await User.updateOne(
            { _id: req.user },
            {
                "personal_info.password": hashedPassword,
                $unset: { refreshToken: 1 },
                $set: { refresh_sessions: [] }, // password change logs out every other device
            }
        );

        audit.log(req, 'PASSWORD_CHANGED', {});

        // Issue fresh tokens for the current session
        const tokens = await createUserSession(req.user);
        setRefreshCookie(res, tokens.refresh_token);

        return res.status(200).json({
            message: "Password changed successfully",
            access_token: tokens.access_token,
            refresh_token: bodyRefreshToken(req, tokens.refresh_token),
        });

    } catch (err) {
        (req.log || console).error({ err }, '[Change Password Error]');
        return res.status(500).json({ error: ERRORS.SERVER_ERROR });
    }
};
