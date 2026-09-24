/** @type {import('next').NextConfig} */
const nextConfig = {
  // Rankings moved to the home page.
  async redirects() {
    return [{ source: "/rankings", destination: "/", permanent: false }];
  },
};
export default nextConfig;
