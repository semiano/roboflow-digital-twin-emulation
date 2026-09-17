/// <reference types="vitest" />
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Roboflow's cloud endpoints send no `Access-Control-Allow-Origin`, so a browser
 * cannot call them directly — measured, not assumed (see TODO.md §6 findings).
 *
 * The dev server proxies them instead, which fixes CORS and, more importantly,
 * means the API key never has to be in the client bundle: it is attached here,
 * server-side, from a non-`VITE_` variable that Vite will not inline. In
 * production the same job belongs to whatever sits in front of the app.
 */
function roboflowProxy(env: Record<string, string>): Record<string, ProxyOptions> {
  const apiKey = env['ROBOFLOW_API_KEY'] ?? env['VITE_ROBOFLOW_API_KEY'] ?? '';
  const upstream = env['ROBOFLOW_UPSTREAM'] ?? 'https://serverless.roboflow.com';

  const strip = (path: string, prefix: RegExp): string => path.replace(prefix, '');

  return {
    // Inference accepts the key as a bearer token.
    '/rf-infer': {
      target: upstream,
      changeOrigin: true,
      rewrite: (path) => strip(path, /^\/rf-infer/),
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
        });
      },
    },
    // The platform API only reads `api_key`, so the key goes in the query
    // instead — still server-side, still never in the browser.
    '/rf-api': {
      target: 'https://api.roboflow.com',
      changeOrigin: true,
      rewrite: (path) => {
        const stripped = strip(path, /^\/rf-api/);
        if (!apiKey) return stripped;
        return `${stripped}${stripped.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`;
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  // Empty prefix so server-only variables are visible here but never bundled.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: roboflowProxy(env),
    },
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/simulation/**', 'src/controls/**', 'src/historian/**', 'src/core/**'],
      },
    },
  };
});
