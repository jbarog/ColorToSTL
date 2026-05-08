import { defineConfig } from 'vite';

export default defineConfig({
  // In GitHub Actions the repo is served at /<repo-name>/, locally at /
  base: process.env.GITHUB_ACTIONS ? '/ColorToSTL/' : '/',
});
