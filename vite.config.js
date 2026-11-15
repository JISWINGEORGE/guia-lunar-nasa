
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/horizons": {
        target: "https://ssd.jpl.nasa.gov",
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(
            /^\/api\/horizons/,
            "/api/horizons.api"
          ),
      },

      "/api/lola": {
        target: "https://pgda.gsfc.nasa.gov",
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(
            /^\/api\/lola/,
            "/data/LOLA_20mpp"
          ),
      },
    },
  },
});
