import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        // Today at 00:00:00
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const [totalRes, newTodayRes, signalsRes] = await Promise.all([
            supabase
                .from('addresses')
                .select('*', { count: 'exact', head: true }),
            supabase
                .from('addresses')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startOfDay.toISOString()),
            supabase
                .from('logs')
                .select('*', { count: 'exact', head: true })
                .gte('timestamp', startOfDay.toISOString()),
        ]);

        return NextResponse.json({
            totalMonitored: totalRes.count || 0,
            todaySignals: signalsRes.count || 0,
            increaseToday: newTodayRes.count || 0,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
