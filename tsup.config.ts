import { defineConfig } from "tsup";

export default defineConfig([
  // ESM build for npm usage
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom"],
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
    outDir: "dist",
  },
  // IIFE build for CDN / script tag usage
  // Bundles React + ReactDOM inline so the script tag is self-contained
  {
    entry: { sdk: "src/index.ts" },
    format: ["iife"],
    globalName: "FeedbackAgent",
    sourcemap: true,
    minify: true,
    outDir: "dist",
    esbuildOptions(options) {
      options.jsx = "automatic";
      // React, Axios, and other packages check process.env.NODE_ENV at runtime.
      // In a browser IIFE there is no `process`, so we must replace it at build time.
      options.define = {
        "process.env.NODE_ENV": '"production"',
        "process.env": "{}",
        "process": '{"env":{"NODE_ENV":"production"}}',
      };
    },
    // Inline everything — CDN users don't have React available
    noExternal: ["react", "react-dom", "html2canvas"],
    // After bundle, FeedbackAgent global will be the module's default export
    footer: {
      js: "if(typeof window !== 'undefined' && window.FeedbackAgent && window.FeedbackAgent.default){ window.FeedbackAgent = window.FeedbackAgent.default; }",
    },
  },
]);
