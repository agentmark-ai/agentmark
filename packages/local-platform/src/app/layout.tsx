import { Layout } from "@/components";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "@/theme";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", margin: 0 }}>
        <NextIntlClientProvider>
          <AppRouterCacheProvider>
            <ThemeProvider>
              <Layout>{children}</Layout>
            </ThemeProvider>
          </AppRouterCacheProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
