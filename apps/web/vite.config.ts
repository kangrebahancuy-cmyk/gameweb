import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500, // Phaser is ~1.2 MB minified
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
});
