import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    base: './', // <--- THIS IS THE MAGIC FIX. (Forces relative paths)
    define: {
      // Support both old and new env variable names for backward compatibility
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/shared': path.resolve(__dirname, './src/shared'),
        '@/client': path.resolve(__dirname, './src/client'),
        '@/operations': path.resolve(__dirname, './src/operations'),
        '@/features': path.resolve(__dirname, './src/features'),
        '@/hooks': path.resolve(__dirname, './src/hooks'),
        '@/lib': path.resolve(__dirname, './src/lib'),
        '@/types': path.resolve(__dirname, './src/shared/types.ts'),
        '@/utils': path.resolve(__dirname, './src/shared/utils'),
        '@/ui': path.resolve(__dirname, './src/shared/ui'),
        '@/db': path.resolve(__dirname, './src/lib/supabase.ts')
      }
    }
  };
});
