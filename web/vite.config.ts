import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "fs"
import { resolve } from "path"

const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
