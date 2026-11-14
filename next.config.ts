import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js resolves its worker with a relative dynamic import. Transformers.js
  // loads ONNX Runtime and Sharp native binaries at runtime. Keeping these
  // packages external lets Node resolve their platform files instead of
  // bundling them into the server output.
  serverExternalPackages: [
    "pdfjs-dist",
    "@huggingface/transformers",
    "@huggingface/tokenizers",
    "onnxruntime-node",
    "onnxruntime-web",
    "sharp",
    // Native Argon2 binding used by Auth.js credential verification.
    "@node-rs/argon2",
  ],

  // PDF.js loads its worker and standard fonts through runtime-built paths.
  // Vercel's file tracer cannot follow those dynamic reads, so an external
  // package alone is not enough: the assets must be included explicitly or
  // text extraction fails only in the deployed Function. The /api/** key also
  // avoids glob issues with dynamic route brackets.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },

  // Avoid Turbopack walking up to the home directory because of unrelated
  // lockfiles outside this project.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
