import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Dev server only: lets the scene editor's "Save into project" button write a
 * scene file straight into src/content/scenes/. It is not part of the built
 * game. It only accepts a valid scene id and valid JSON, and only writes into
 * that one folder.
 */
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function editorSavePlugin(dir = path.resolve('src/content/scenes')): Plugin {
  return {
    name: 'peek-a-kumo-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/save-scene', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 2_000_000) req.destroy();
        });
        req.on('end', () => {
          try {
            const { id, text } = JSON.parse(body) as { id?: unknown; text?: unknown };
            if (typeof id !== 'string' || !ID.test(id)) throw new Error('The scene id must be lowercase letters, numbers and dashes.');
            if (typeof text !== 'string') throw new Error('Nothing to save.');
            const scene = JSON.parse(text) as { id?: unknown };
            if (scene.id !== id) throw new Error('The file id does not match the scene id.');
            const file = path.join(dir, `${id}.json`);
            fs.writeFileSync(file, text);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(`Saved ${path.relative(process.cwd(), file)}`);
          } catch (error) {
            res.statusCode = 400;
            res.end((error as Error).message);
          }
        });
      });
    },
  };
}
