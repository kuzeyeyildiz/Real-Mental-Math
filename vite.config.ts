/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [
    react(),
    /*
     * React Compiler. The codebase was already written to its rules — the
     * compiler diagnostics in eslint-plugin-react-hooks v7 have been enforced
     * all along — so this turns on the auto-memoization that work was paying
     * for and never receiving.
     */
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    /*
     * Pinned. 5173 is another project of this machine's and 5174 is VS Code, so
     * the default would wander onto a neighbour's port; strictPort makes a
     * clash a visible error rather than a silent move.
     */
    port: 5175,
    strictPort: true,
  },
  test: {
    environment: 'node',
    /* `.tsx` as well as `.ts`: a component test under the old glob was
       collected by nothing and passed by default. */
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
