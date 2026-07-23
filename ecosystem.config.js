module.exports = {
  apps: [
    {
      name: "comfyui-prompt-studio",
      script: "npm",
      args: "run start",
      // Asset downloads keep job state in-process memory — cluster mode loses
      // progress across workers and fights over port 3000. Use a single fork.
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        // package.json `start` also pins -p 47832; keep these aligned.
        PORT: 47832,
        HOSTNAME: "0.0.0.0",
        // Same-machine installs into ComfyUI models/ (must be writable by this process).
        COMFYUI_ROOT: "/opt/comfyui",
      },
    },
  ],
};
