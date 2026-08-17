import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { copyFile, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const landingFile = fileURLToPath(new URL('public/landing.html', import.meta.url))

// Serves the standalone landing page at the site root (/) and keeps the PERN
// app reachable at /app.html (dev) and dist/app.html (prod).
function landingAtRoot(): Plugin {
  return {
    name: 'landing-at-root',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0]
        if (pathname === '/') {
          try {
            const html = await readFile(landingFile, 'utf-8')
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(html)
            return
          } catch {
            /* fall through */
          }
        } else if (pathname === '/app.html') {
          res.statusCode = 302
          res.setHeader('Location', '/index.html')
          res.end()
          return
        }
        next()
      })
    },
    async closeBundle() {
      const distDir = fileURLToPath(new URL('dist', import.meta.url))
      try {
        const files = await readdir(distDir)
        const indexFile = files.find(f => f.startsWith('index') && f.endsWith('.html'))
        if (!indexFile) throw new Error('No index.html found in dist/')
        const appHtml = join(distDir, indexFile)
        const appTarget = join(distDir, 'app.html')
        await copyFile(appHtml, appTarget)
        const landing = await readFile(landingFile, 'utf-8')
        await writeFile(appHtml, landing)
      } catch (err) {
        this.error(`landing-at-root: ${(err as Error).message}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), landingAtRoot()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  server: {
    port: 5174,
    allowedHosts: ['.trycloudflare.com', '.loca.lt', '.serveo.net', '.ngrok-free.dev', '.ngrok.app'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8081',
        changeOrigin: true,
        ws: true,
      },
      '/mqtt': {
        target: 'ws://localhost:9001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('leaflet') || id.includes('react-leaflet')) return 'maps';
            if (id.includes('framer-motion')) return 'motion';
            if (id.includes('jspdf')) return 'pdf';
            if (id.includes('xlsx') || id.includes('SheetJS')) return 'xlsx';
            if (id.includes('mqtt')) return 'mqtt';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router') || id.includes('scheduler')) return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
})
