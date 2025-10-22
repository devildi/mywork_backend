module.exports = {
  apps: [
    {
      name: 'mywork-backend',
      script: 'app/index.js',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
