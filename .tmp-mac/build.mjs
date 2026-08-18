import * as esbuild from "esbuild";
const stub = {
  name: "stub",
  setup(b) {
    b.onResolve({ filter: /^(\.\.\/)+db$/ }, () => ({ path: "x", namespace: "stub" }));
    b.onResolve({ filter: /^(\.\.\/)+supabase$/ }, () => ({ path: "x", namespace: "stub" }));
    b.onResolve({ filter: /^@tauri-apps\// }, () => ({ path: "x", namespace: "stub" }));
    b.onResolve({ filter: /services\/archivos$/ }, () => ({ path: "x", namespace: "stub" }));
    b.onResolve({ filter: /\?url$/ }, () => ({ path: "url", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
      contents: a.path === "url" ? "export default ''" :
        "export const _=0; export function readFile(){return Promise.reject(new Error('stub'))}" +
        " export function rutaEnDatos(){return Promise.reject(new Error('stub'))}" +
        " export function invoke(){return Promise.reject(new Error('stub'))}",
      loader: "js",
    }));
  },
};
await esbuild.build({
  entryPoints: ["/home/user/tesoreria-Mac-/.tmp-mac/app.tsx"],
  bundle: true, outfile: "/home/user/tesoreria-Mac-/.tmp-mac/app.js",
  jsx: "automatic", format: "esm",
  define: { "import.meta.env": "{\"DEV\":false,\"VITE_CANAL\":\"\"}", "__FECHA_BUILD__": '"2026-08-18"', "process.env.NODE_ENV": '"development"' },
  plugins: [stub], loader: { ".png": "dataurl", ".svg": "dataurl" },
});
