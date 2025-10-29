"use client";
import { Request, Requests } from "@agentmark/ui-components";
import { useTranslations } from "next-intl";
import { use } from "react";
import { FILE_SERVER_URL } from "../../config/api";

const getRequests = async () => {
  try {
    const response = await fetch(`${FILE_SERVER_URL}/v1/requests`);
    const data = await response.json();
    return data.requests as Request[];
  } catch (error) {
    return [];
  }
};

const promise = getRequests();

export default function RequestsPage() {
  const t = useTranslations("requests");

  const requests = use(promise);

  return (
    <Requests
      loading={false}
      requests={requests}
      t={t}
    />
  );
}
