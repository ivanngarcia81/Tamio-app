import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Sello de compilación visible en Configuración → Restaurar. Existe para
  // una sola cosa: saber por una captura de pantalla QUÉ compilación está
  // corriendo el usuario. Un arreglo se probó tres veces contra una app vieja
  // sin que nadie pudiera notarlo; con el sello, eso se ve a simple vista.
  define: {
    __FECHA_BUILD__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"
    ),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
