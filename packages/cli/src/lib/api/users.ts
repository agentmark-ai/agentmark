import { API_URL } from "../../config/api";

export type User = {
  id: string;
  user_id: string;
  count: number;
  total_cost: number;
  avg_tokens: number;
  completion_tokens: number;
  prompt_tokens: number;
  avg_requests_per_day: number;
};

export type GetUsersOptions = {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  filter?: { field: string; operator: string; value: any }[]; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type GetUsersResponse = {
  users: User[];
  total: number;
};

export const getUsers = async (
  options?: GetUsersOptions
): Promise<GetUsersResponse> => {
  try {
    const params = new URLSearchParams();
    if (options?.page !== undefined) {
      params.append("page", options.page.toString());
    }
    if (options?.pageSize !== undefined) {
      params.append("pageSize", options.pageSize.toString());
    }
    if (options?.sortBy) {
      params.append("sortBy", options.sortBy);
    }
    if (options?.sortOrder) {
      params.append("sortOrder", options.sortOrder);
    }
    if (options?.filter && options.filter.length > 0) {
      params.append("filter", JSON.stringify(options.filter));
    }

    const response = await fetch(`${API_URL}/v1/users?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      users: data.users || [],
      total: data.total || 0,
    };
  } catch (error) {
    console.error("Error fetching users:", error);
    return { users: [], total: 0 };
  }
};


