// PM2 process file — run with: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'ai-frontdesk',
      script: 'src/server.js',
      instances: 1, // SQLite + in-memory sessions => keep a single instance
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      time: true,
    },
  ],
};
