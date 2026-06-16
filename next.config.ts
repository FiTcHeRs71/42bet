import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Génère un serveur Node auto-contenu dans .next/standalone (image Docker légère).
  // Sans effet sur le déploiement Vercel, qui ignore cette option.
  output: "standalone",
};

export default nextConfig;
