import { resolve } from 'node:path'
import react from '@vitejs/plugin-react-swc'
import UnoCSS from 'unocss/vite'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import pages from 'vite-plugin-pages'
import svgr from 'vite-plugin-svgr'

const guiRoot = resolve(__dirname, '../../../packages/gui/src')

/** Resolve bare imports from gui package source using the app's node_modules */
function guiResolvePlugin(appNodeModules: string): Plugin {
  return {
    name: 'gui-resolve',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.startsWith(guiRoot) && !source.startsWith('.') && !source.startsWith('/')) {
        // Bare import from gui source — resolve from app's node_modules
        return this.resolve(source, resolve(appNodeModules, '__placeholder__.js'), { skipSelf: true })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      guiResolvePlugin(resolve(__dirname, 'node_modules')),
      react(),
      UnoCSS(),
      svgr(),
      pages({
        extensions: ['tsx'],
        exclude: ['**/{components,assets,blocks,hooks,store,__tests__}/**/*.*', '**/_*.*'],
        routeStyle: 'next',
        importMode: 'async',
        dirs: 'src/pages',
        resolver: 'react'
      }),
      {
        name: 'api-handler',
        configureServer(server) {
          server.middlewares.use('/_env', (_req, res, _next) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            const data = {
              'XXX': env.XXX
            }
            res.end(JSON.stringify(data))
          })
        }
      }
    ],
    resolve: {
      alias: [
        { find: '@', replacement: resolve(__dirname, './src') },
      ],
    },
    server: {
      port: 9321,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:9320',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://127.0.0.1:9320',
          ws: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:9320',
          changeOrigin: true,
        },
      },
    },
  }
})
