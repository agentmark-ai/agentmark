"use client";

import { UsersList } from "@agentmark/ui-components";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getUsers, User } from "../../lib/api/users";
import { Card, Stack, Typography } from "@mui/material";

export default function UsersPage() {
  const t = useTranslations("users");
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAllUsers = async () => {
      setIsLoading(true);
      try {
        // Fetch all users (with a large page size to get all data)
        // For client-side filtering, we need all data
        const result = await getUsers({
          page: 0,
          pageSize: 10000, // Large number to get all users
        });
        
        // Ensure all numeric values default to 0
        const normalizedUsers = result.users.map((user) => ({
          ...user,
          count: user.count ?? 0,
          total_cost: user.total_cost ?? 0,
          avg_tokens: user.avg_tokens ?? 0,
          completion_tokens: user.completion_tokens ?? 0,
          prompt_tokens: user.prompt_tokens ?? 0,
          avg_requests_per_day: user.avg_requests_per_day ?? 0,
        }));
        
        setUsers(normalizedUsers);
      } catch (error) {
        console.error("Error fetching users:", error);
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllUsers();
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        {t("title")}
      </Typography>
      <Card>
        <UsersList
          loading={isLoading}
          users={users}
          filterMode="client"
          paginationMode="client"
          sortingMode="client"
          t={t}
        />
      </Card>
    </Stack>
  );
}

