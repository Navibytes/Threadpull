import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the landing page moved from /landing to the home page
  async redirects() {
    return [{ source: "/landing", destination: "/", permanent: false }];
  },
};

export default nextConfig;
