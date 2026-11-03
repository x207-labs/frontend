import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { buildCsp, cspMeta } from './src/lib/csp'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
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
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubGlobals: true,
  },
}))
