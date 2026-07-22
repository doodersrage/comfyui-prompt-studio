module.exports = {
    apps: [
      {
        name: 'comfyui-prompt-studio',
        script: 'npm',
        args: 'run start',
        instances: 'max',
        exec_mode: 'cluster',
        env: {
          NODE_ENV: 'production',
          PORT: 3000,
          HOSTNAME: '0.0.0.0' // Required for Next.js standalone/cluster mode
        }
      }
    ]
  };
  