import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { buildCsp, cspMeta } from './src/lib/csp.ts'

export default defineConfig(({ mode }) => ({
  // FE-031: `@x207/core` imports `node:crypto`; the browser gets a small stand-in (see the file). The tests run on Node and keep the real module.
  resolve: mode === 'test' ? {} : { alias: { 'node:crypto': fileURLToPath(new URL('./src/lib/node-crypto-shim.ts', import.meta.url)) } },
  plugins: [
    react(),
    {
      name: 'x207-dev-globals',
      apply: 'serve',
      transformIndexHtml: () => [{ tag: 'script', attrs: { type: 'module', src: '/src/dev-globals.ts' }, injectTo: 'head-prepend' }],
    },
    {
      // Batch 3 F4: the policy for scripts and connections only in the production build; the dev server needs inline scripts for hot reload.
      name: 'x207-csp',
      apply: 'build',
      transformIndexHtml(html: string) {
        const env = loadEnv(mode, process.cwd(), 'VITE_')
        return env.VITE_X207_CSP === 'off' ? html : html.replace('</head>', `    ${cspMeta(buildCsp(env))}\n  </head>`)
      },
    },
  ],
  server: { port: 5207, strictPort: true },
  test: {
    environment: 'jsdom',
    css: { include: [/styles\.css/] }, // the contrast test reads the colour tokens of styles.css as text
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubGlobals: true,
  },
}))
