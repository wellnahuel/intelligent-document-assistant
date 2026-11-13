// Vitest runs the server modules outside Next's bundler. Next aliases the
// real `server-only` package to an empty server module; tests need the same
// behavior instead of the package's client-side throw.
export {};
