module.exports = {
  apps: [
    {
      name: "weblaund-backend",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      }
    }
  ]
}
