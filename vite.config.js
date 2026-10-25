import { defineConfig } from 'vite';
// base './' — сайт открывается из любой папки (GitHub Pages, project site)
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 1500 } });
