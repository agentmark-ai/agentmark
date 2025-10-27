"use client";
import { Request, Requests } from "@agentmark/ui-components";
import { useTranslations } from "next-intl";
import { use } from "react";

const getRequests = async () => {
  const response = await fetch("http://localhost:9002/v1/get-requests");
  const data = await response.json();
  return data.requests as Request[];
};

const promise = getRequests();

export default function RequestsPage() {
  const t = useTranslations("requests");

  const requests = use(promise);
  console.log(requests);
  return (
    <Requests
      loading={false}
      handleFilterChange={() => {}}
      handleSortChange={() => {}}
      requests={requests}
      onPaginationChange={() => {}}
      rowsPerPage={10}
      page={1}
      totalRows={10}
      onRowClick={() => {}}
      filterModel={{ items: [] }}
      t={t}
    />
  );
}
