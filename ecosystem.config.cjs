module.exports = {
  apps: [
    {
      name: 'gelbcrm',
      cwd: '/var/www/gelbcrm',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      max_restarts: 10,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
