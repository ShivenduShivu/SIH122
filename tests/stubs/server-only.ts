// `server-only` exists to fail a client bundle at build time. Under vitest every module runs on
// Node, so the real package's guard would reject server modules we do want to test directly.
export {};
