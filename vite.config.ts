import path from 'path';
import { defineConfig } from 'vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 3001,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:9001',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [tanstackRouter({target:'react',autoCodeSplitting:true}), react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
