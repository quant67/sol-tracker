import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'app_debug.log');

export function logToFile(message: string, type: 'INFO' | 'ERROR' | 'SUCCESS' | 'WEBHOOK' = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}\n`;

    try {
        fs.appendFileSync(LOG_FILE, logEntry);
    } catch (err) {
        console.error('Failed to write to log file:', err);
    }

    // Also keep console logging for local visibility
    const icon = type === 'ERROR' ? '❌' : type === 'SUCCESS' ? '✅' : type === 'WEBHOOK' ? '🚀' : 'ℹ️';
    console.log(`${icon} [${type}] ${message}`);
}
