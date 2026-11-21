import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };
import { editorSavePlugin } from './tools/editor-save-plugin.ts';
import { shapesPlugin } from './tools/shapes-plugin.ts';

// The game is served from https://kumoplay.github.io/peek-a-kumo/,
// so every asset path must start with /peek-a-kumo/.
const base = '/peek-a-kumo/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    // Turns the art into tap shapes (see tools/shapes-plugin.ts).
    shapesPlugin(),
    // Dev server only: the scene editor's "Save into project" button.
    editorSavePlugin(),
    // Makes the game installable ("Add to Home Screen") and playable offline after the first visit.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // src/platform/pwa.ts registers it, so the game can offer an "Update" button
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Peek-a-Kumo',
        short_name: 'Peek-a-Kumo',
        description: 'A cozy hidden-object game in a little town on the clouds. A KumoPlay game.',
        lang: 'en',
        // Only this game's part of kumoplay.github.io: other KumoPlay games keep their own.
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#DCEBFB',
        theme_color: '#DCEBFB',
        categories: ['games'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache names start with the game's name, so they never mix with another KumoPlay game's.
        cacheId: 'peek-a-kumo',
        // Everything, scene art included, so the whole game works with no connection.
        // The page only loads what it needs; the rest downloads quietly after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'assets/nunito-latin-wght-normal-*.woff2'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
