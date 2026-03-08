import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

// Routes that don't require authentication
const PUBLIC_PATHS = [
    '/login',
    '/api/auth/',
    '/api/webhook/',
];

// Static assets and Next.js internals — always allow
const STATIC_PATHS = [
    '/_next/',
    '/favicon.ico',
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Always allow static assets
    if (STATIC_PATHS.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // Always allow public paths
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // Check auth cookie
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
        // Redirect to login for page requests, 401 for API
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    // Token exists — allow through
    // (Full token verification happens server-side in API routes if needed;
    //  middleware only checks for presence to keep it fast)
    return NextResponse.next();
}

export const config = {
    matcher: [
        // Match all paths except static files
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
