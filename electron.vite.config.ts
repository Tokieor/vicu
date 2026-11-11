import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error 构建插件是 .mjs，没有类型声明，只在构建期使用
import { i18nPlugin } from './scripts/i18n-vite-plugin.mjs'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          'quick-entry': resolve(__dirname, 'src/preload/quick-entry.ts'),
          'quick-view': resolve(__dirname, 'src/preload/quick-view.ts'),
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      // Scripts loaded by URL (the AudioWorklet of local speech, src/renderer/lib/ai/pcm-worklet.js)
      // stay files: the page's CSP allows scripts from 'self' only, not data: URLs.
      assetsInlineLimit: (file: string) => (file.endsWith('.js') ? false : undefined),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          'quick-entry': resolve(__dirname, 'src/renderer/quick-entry/index.html'),
          'quick-view': resolve(__dirname, 'src/renderer/quick-view/index.html'),
        }
      }
    },
    plugins: [i18nPlugin({ include: '/src/renderer/' }), react()],
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer')
      }
    }
  }
})
