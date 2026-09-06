import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // VITE_CONVEX_URL is baked into the bundle at build time, and a build with it
  // unset still succeeds — the app then dies in the browser on first paint with
  // "No address provided to ConvexReactClient". That took the site down once.
  // Fail the build instead: a frontend with no backend address is never the
  // artifact anyone wanted. `npm run deploy` takes the value from Convex itself,
  // so the deploy path can't stamp the wrong deployment either.
  //
  // Keep prose here free of bare Tailwind utility words: this file is scanned
  // for class candidates, so a stray one lands in the shipped CSS.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), '')
    if (!env.VITE_CONVEX_URL) {
      throw new Error(
        'VITE_CONVEX_URL is not set — refusing to build a bundle with no Convex address.\n' +
          'Deploy with `npm run deploy`, or build against one deployment with\n' +
          '  VITE_CONVEX_URL=https://<deployment>.convex.cloud npm run build',
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0', // exe.dev proxy needs non-localhost binding
      allowedHosts: ['convex-openai-hackathon.exe.xyz', '.exe.xyz'],
    },
  }
})
