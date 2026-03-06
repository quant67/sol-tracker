const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
for (const k in envConfig) process.env[k] = envConfig[k];

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function dump() {
    console.log('Fetching logs from Supabase...');
    try {
        const { data: logs, error: logError } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(10);
        let output = '--- RECENT LOGS ---\n';
        if (logError) {
            console.error('Supabase error:', logError);
            output += JSON.stringify(logError, null, 2);
        } else {
            console.log(`Successfully fetched ${logs?.length || 0} logs.`);
            output += JSON.stringify(logs, null, 2);
        }

        fs.writeFileSync('db_dump.txt', output);
        console.log('Written to db_dump.txt');
    } catch (e) {
        console.error('Crash:', e);
    }
}

dump().then(() => console.log('Done.'));
