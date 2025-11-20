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
    {
      name: 'worker-enrich',
      script: 'npm',
      args: 'run worker:enrich',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'none', // run npm directly instead of via node
    },
  ],
};
