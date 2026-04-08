import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:3483",
        ws: true,
      },
      "/health": "http://localhost:3483",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
