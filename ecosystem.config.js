module.exports = {
  apps: [
    {
      name: 'policy-diff-api',
      script: './dist/server.js',
      instances: 1, // MUST be 1 for deterministic in-memory concurrency guard
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      combine_logs: true,
      merge_logs: true,
    },
  ],
};
