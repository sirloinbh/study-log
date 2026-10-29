import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
// Ports come from the central registry (slot 02).
export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5202,
    strictPort: true,
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3102' },
  },
});
