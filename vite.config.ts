import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { buildCsp, cspMeta } from './src/lib/csp.ts'

// FE-038: one nonce per build. The wallet executors of NEAR Connect run in srcdoc iframes whose inline scripts inherit this policy; the library puts the nonce on them (`cspNonce`).
// The nonce sits in the shipped index.html, so it is not a secret: it keeps `'unsafe-inline'` out of `script-src`, it does not stop an attacker who can already inject markup.
const CSP_NONCE = randomBytes(16).toString('base64')

export default defineConfig(({ mode }) => ({
  define: { __X207_CSP_NONCE__: mode === 'production' ? JSON.stringify(CSP_NONCE) : 'undefined' },
  // FE-031: `@x207/core` imports `node:crypto`; the browser gets a small stand-in (see the file). The tests run on Node and keep the real module.
  // FE-044: in the umbrella workspace `motion` is hoisted to the root node_modules while React stays in this package's own; dedupe makes `motion` find this React.
  resolve: {
    dedupe: ['react', 'react-dom'],
    ...(mode === 'test' ? {} : { alias: { 'node:crypto': fileURLToPath(new URL('./src/lib/node-crypto-shim.ts', import.meta.url)) } }),
  },
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
        return env.VITE_X207_CSP === 'off' ? html : html.replace('</head>', `    ${cspMeta(buildCsp(env, CSP_NONCE))}\n  </head>`)
      },
    },
  ],
  server: { port: 5207, strictPort: true },
  test: {
    environment: 'jsdom',
    css: { include: [/styles\.css/] }, // the contrast test reads the colour tokens of styles.css as text
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    server: { deps: { inline: ['motion', 'framer-motion', 'motion-dom', 'motion-utils'] } }, // FE-044: so the dedupe above applies to them in the tests too
    restoreMocks: true,
    unstubGlobals: true,
  },
}))
