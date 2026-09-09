import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // (or vue, etc)

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,      
    port: 5173       
  }
})
