import { cookies } from 'next/headers';

const COOKIE_NAME = 'sol-tracker-auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Simple HMAC-SHA256 based token signing/verification.
 * No external JWT library needed.
 */
async function hmacSign(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
    const expected = await hmacSign(payload, secret);
    return expected === signature;
}

function getSecret(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET is not set');
    return secret;
}

/**
 * Create a signed auth token with expiry
 */
export async function createAuthToken(): Promise<string> {
    const secret = getSecret();
    const payload = JSON.stringify({
        sub: 'admin',
        exp: Date.now() + COOKIE_MAX_AGE * 1000,
    });
    const sig = await hmacSign(payload, secret);
    // Token format: base64(payload).signature
    return `${btoa(payload)}.${sig}`;
}

/**
 * Verify an auth token
 */
export async function verifyAuthToken(token: string): Promise<boolean> {
    try {
        const secret = getSecret();
        const [payloadB64, sig] = token.split('.');
        if (!payloadB64 || !sig) return false;

        const payload = atob(payloadB64);
        const valid = await hmacVerify(payload, sig, secret);
        if (!valid) return false;

        const data = JSON.parse(payload);
        if (data.exp < Date.now()) return false;

        return true;
    } catch {
        return false;
    }
}

/**
 * Set the auth cookie
 */
export async function setAuthCookie(token: string) {
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
    });
}

/**
 * Get the auth cookie value
 */
export async function getAuthCookie(): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get(COOKIE_NAME)?.value;
}

/**
 * Clear the auth cookie
 */
export async function clearAuthCookie() {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
}

export { COOKIE_NAME };
