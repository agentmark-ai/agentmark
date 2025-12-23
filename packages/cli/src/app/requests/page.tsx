"use client";
import { Request, Requests } from "@agentmark-ai/ui-components";
import { useTranslations } from "next-intl";
import { use, useEffect, useState } from "react";
import { API_URL } from "../../config/api";

const getRequests = async () => {
  try {
    const response = await fetch(`${API_URL}/v1/requests`);
    const data = await response.json();
    return data.requests as Request[];
  } catch (error) {
    console.error("Error fetching requests:", error);
    return [];
  }
};

export default function RequestsPage() {
  const t = useTranslations("requests");
  const [requests, setRequests] = useState<Request[]>([]);

  useEffect(() => {
    const fetchRequests = async () => {
      const requests = await getRequests();
      setRequests(requests);
    };
    fetchRequests();
  }, []);

  return (
    <Requests
      loading={false}
      requests={requests}
      t={t}
    />
  );
}
