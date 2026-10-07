import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';

export default {
  plugins: [tailwindcss()],
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } }
};
