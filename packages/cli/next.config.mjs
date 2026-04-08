import createNextIntlPlugin from "next-intl/plugin";

const nextConfig = {
    distDir: "./dist/.next",
    redirects: async () => {
        return [
            {
                source: "/",
                destination: "/requests",
                permanent: true,
            },
        ];
    },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
