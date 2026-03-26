module.exports = {
  apps: [{
    name: 'feng-farm',
    script: './games/farm/server/server.js',
    interpreter: '/home/openclaw/.nvm/versions/node/v20.20.1/bin/node',
    cwd: '/opt/1panel/www/sites/indeed-flow-prod/feng-farm',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3007,
      // LLM配置从环境变量读取（部署时注入）
      LLM_API_URL: process.env.LLM_API_URL || '',
      LLM_API_KEY: process.env.LLM_API_KEY || '',
      LLM_MODEL: process.env.LLM_MODEL || 'gpt-3.5-turbo'
    },
    error_file: '/var/log/pm2/feng-farm-error.log',
    out_file: '/var/log/pm2/feng-farm-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};