module.exports = {
  apps: [
    {
      name: "weblaund-backend",
      script: "dist/main.js",
      // .env is loaded relative to the working directory, so this must be
      // pinned — starting PM2 from anywhere else silently skips the file and
      // the app fails env validation at boot.
      cwd: "/var/www/weblaud-backend",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      time: true,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
