import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  // Static for now, we'll change this later
  const locale = "en";

  return {
    locale,
    messages: (await import(`./langs/${locale}.json`)).default,
  };
});
