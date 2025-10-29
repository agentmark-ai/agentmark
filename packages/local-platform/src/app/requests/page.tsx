"use client";
import { Request, Requests } from "@agentmark/ui-components";
import { useTranslations } from "next-intl";
import { use } from "react";

const getRequests = async () => {
  try {
    const response = await fetch("http://localhost:9002/v1/get-requests");
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
