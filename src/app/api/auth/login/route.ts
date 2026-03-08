import { NextRequest, NextResponse } from 'next/server';
import { createAuthToken, COOKIE_NAME } from '@/lib/auth';

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

        // Password correct — create token and set cookie on response
        const token = await createAuthToken();
        const response = NextResponse.json({ success: true });

        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: '/',
        });

        return response;
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Login failed' },
            { status: 500 }
        );
    }
}

