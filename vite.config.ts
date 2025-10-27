import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

function walkFiles(dir: string, baseDir = dir): Array<{ abs: string; rel: string }> {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(absPath, baseDir);
    }
    if (entry.isFile()) {
      return [{ abs: absPath, rel: relative(baseDir, absPath) }];
    }
    return [] as Array<{ abs: string; rel: string }>;
  });
}

function configStaticPlugin(): Plugin {
  const configDir = resolve(__dirname, 'config');

  return {
    name: 'config-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/config/')) {
          next();
          return;
        }

        const filePath = join(configDir, req.url.slice('/config/'.length));

        try {
          const stats = statSync(filePath);
          if (!stats.isFile()) {
            next();
            return;
          }
        } catch (error) {
          next();
          return;
        }

        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json');
        const stream = createReadStream(filePath);
        stream.on('error', next);
        stream.pipe(res);
      });
    },
    generateBundle() {
      if (!existsSync(configDir)) {
        return;
      }
      for (const file of walkFiles(configDir)) {
        this.emitFile({
          type: 'asset',
          fileName: `config/${file.rel.replace(/\\/g, '/')}`,
          source: readFileSync(file.abs),
        });
      }
    },
  };
}

export default defineConfig({
  server: {
    host: true,
  },
  plugins: [configStaticPlugin()],
});
