/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** The version from package.json, filled in when the game is built. */
declare const __APP_VERSION__: string;

/** Tap shapes made from the art at build time (tools/shapes-plugin.ts). */
declare module 'virtual:shapes' {
  /** Objects and Kumo, by name, for example 'objects/teacup' or 'kumo/side'. */
  export const shapes: Record<string, import('./core/shapes').ShapeData>;
  /** Each scene's props, by art folder: 'scenes/<folder>/<prop>'. */
  export const sceneShapes: Record<
    string,
    () => Promise<{ default: Record<string, import('./core/shapes').ShapeData> }>
  >;
}
