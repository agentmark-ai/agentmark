"use client";
import { Request, Requests } from "@agentmark-ai/ui-components";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getRequests } from "../../lib/api/requests";

export default function RequestsPage() {
  const t = useTranslations("requests");
  const [requests, setRequests] = useState<Request[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchRequests = async () => {
      const fetched = await getRequests();
      if (cancelled) return;
      setRequests(fetched);
    };
    fetchRequests();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Requests
      loading={false}
      requests={requests}
      t={t}
    />
  );
}
