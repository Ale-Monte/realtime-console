// vite.config.js
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  root: join(__dirname, "client"), // now index.html is inside client/
  plugins: [react()],
  build: {
    outDir: "../dist", // output outside of client
    emptyOutDir: true, // clean before build
  },
};
