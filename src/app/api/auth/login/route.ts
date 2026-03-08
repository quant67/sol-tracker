import { NextRequest, NextResponse } from 'next/server';
import { createAuthToken, setAuthCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const { password } = await req.json();

        const correctPassword = process.env.AUTH_PASSWORD;
        if (!correctPassword) {
            return NextResponse.json(
                { error: 'AUTH_PASSWORD not configured' },
                { status: 500 }
            );
        }

        if (password !== correctPassword) {
            return NextResponse.json(
                { error: 'Invalid password' },
                { status: 401 }
            );
        }

        // Password correct — create token and set cookie
        const token = await createAuthToken();
        await setAuthCookie(token);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Login failed' },
            { status: 500 }
        );
    }
}
