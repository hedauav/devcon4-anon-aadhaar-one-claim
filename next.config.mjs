/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server-only packages loaded with Node's own require (native addon, snarkjs wasm).
  serverExternalPackages: ['better-sqlite3', '@anon-aadhaar/core', 'snarkjs'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // snarkjs / ffjavascript reference Node built-ins that are unused in the browser prover.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        readline: false,
        path: false,
        crypto: false,
        os: false,
        constants: false,
        worker_threads: false,
      };
    }
    return config;
  },
};

export default nextConfig;
