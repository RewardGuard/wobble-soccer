import { defineConfig } from "vite";

// base: "./" so a `npm run build` produces a portable dist/ that runs from any
// path (handy for itch.io / Poki-style hosting or just opening locally).
export default defineConfig({
  base: "./",
  server: { host: true },
});
