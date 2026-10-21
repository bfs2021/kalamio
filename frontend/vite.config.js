import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Vite 7's default target dropped Safari 14–15 / Chrome < 107; keep the
    // Vite 4 browser support so readers on older phones aren't locked out.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const path = id.replace(/\\/g, '/');
            if (path.includes('/node_modules/react/') || path.includes('/node_modules/react-dom/') || path.includes('/node_modules/react-router')) {
              return 'vendor-react';
            }
            if (id.includes('@tiptap/')) {
              return 'vendor-editor';
            }
            if (id.includes('lowlight') || id.includes('highlight.js')) {
              return 'vendor-highlight';
            }
            if (id.includes('axios')) {
              return 'vendor-axios';
            }
          }
        },
      },
    },
  },
})
