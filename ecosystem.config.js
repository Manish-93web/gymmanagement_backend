module.exports = {
    apps: [{
        name: 'gym-backend',
        script: './dist/server.js',
        instances: 'max',
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production',
            PORT: 5000
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true,
        max_memory_restart: '1G',
        autorestart: true,
        watch: false,
        max_restarts: 10,
        min_uptime: '10s',
        listen_timeout: 3000,
        kill_timeout: 5000,
        wait_ready: true,
        shutdown_with_message: true
    }]
};
