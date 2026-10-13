import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = fileURLToPath(new URL('./web', import.meta.url));

// The dashboard lives in web/. In development it is served by the Node server
// through Vite's middleware mode (`npm run dev`), so API calls stay same-origin.
export default defineConfig({
  root: webRoot,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
  },
});
