module.exports = {
    apps: [
        {
            name: 'sol-tracker',
            script: '.next/standalone/server.js',
            cwd: '/opt/sol-tracker',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
                HOSTNAME: '0.0.0.0',
            },
            max_memory_restart: '1G',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/opt/sol-tracker/logs/error.log',
            out_file: '/opt/sol-tracker/logs/out.log',
            merge_logs: true,
        },
        {
            name: 'sol-tracker-bot',
            script: 'npm',
            args: 'run bot',
            cwd: '/opt/sol-tracker',
            env: {
                NODE_ENV: 'production',
            },
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/opt/sol-tracker/logs/bot-error.log',
            out_file: '/opt/sol-tracker/logs/bot-out.log',
            merge_logs: true,
        }
    ],
};
