import { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
    distDir: "./dist/.next",
redirects: async () => {
        return [
            {
                source: "/",
                destination: "/requests",
                permanent: true
            }
        ]
    }
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
