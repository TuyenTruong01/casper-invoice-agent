const nextConfig = {
  // Keep the ESM/WASM package intact and let Next trace its .wasm asset into
  // the Node server function. It is never included in the browser bundle.
  serverExternalPackages: ['mupdf'],
};
export default nextConfig;
