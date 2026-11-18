import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.resolve(here, '../shared');
// Same variable the server reads (not PORT, which launchers set for everything).
const API_PORT = Number(process.env.API_PORT || 8797);

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: { '@shared': SHARED },
  },
  server: {
    port: 5177,
    strictPort: true,
    // shared/ lives outside this folder; Vite refuses to serve it unless allowed.
    fs: { allow: [here, SHARED] },
    // The app calls /api/... on its own origin and Vite forwards it, so no
    // server address is baked into the frontend and no CORS is needed.
    proxy: {
      '/api': `http://127.0.0.1:${API_PORT}`,
      '/health': `http://127.0.0.1:${API_PORT}`,
    },
  },
  build: {
    outDir: path.resolve(here, '../dist'),
    emptyOutDir: true,
  },
});
