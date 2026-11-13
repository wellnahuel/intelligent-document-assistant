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

  // Avoid Turbopack walking up to the home directory because of unrelated
  // lockfiles outside this project.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
