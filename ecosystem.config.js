module.exports = {
  apps: [{
    name: 'feng-farm',
    script: './games/farm/server/server.js',
    cwd: '/opt/1panel/www/sites/indeed-flow-prod/feng-farm',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3007
    },
    error_file: '/var/log/pm2/feng-farm-error.log',
    out_file: '/var/log/pm2/feng-farm-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};