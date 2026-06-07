/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exclude heavy WASM/ML packages from server-side bundling.
  // This prevents Turbopack from trying to process them during SSR,
  // which causes the "Cannot convert undefined or null to object" TypeError.
  serverExternalPackages: [
    "@xenova/transformers",
    "@huggingface/transformers",
  ],
};

export default nextConfig;
