import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.HOKSE_API_PORT??'3001'}` },
    watch: { ignored: ['**/public/audio/**', '**/.pnpm-store/**'] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/') && id.includes('katex')) return 'math-renderer';
          if (id.includes('/node_modules/') && /\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react-vendor';
        },
      },
    },
  },
});
