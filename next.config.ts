import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js resolves its worker with a relative dynamic import. Keeping the
  // package external lets Node load it natively instead of bundling it.
  serverExternalPackages: ["pdfjs-dist"],

  // Avoid Turbopack walking up to the home directory because of unrelated
  // lockfiles outside this project.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
