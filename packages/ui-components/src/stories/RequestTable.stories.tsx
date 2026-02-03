import type { Meta, StoryObj } from "@storybook/react";
import { RequestTable } from "@/sections/requests/request-table";
import { requests, requestsLarge } from "./mocks";
import { useState, useMemo, useCallback } from "react";
import { GridFilterModel, GridSortModel } from "@mui/x-data-grid";
import { Request } from "@/sections/requests/type";

// Translation mock
const t = (key: string) => {
  const translations: Record<string, string> = {
    "columnHeader.input": "Input",
    "columnHeader.output": "Output",
    "columnHeader.promptTokens": "Prompt Tokens",
    "columnHeader.completionTokens": "Completion Tokens",
    "columnHeader.cost": "Cost",
    "columnHeader.variables": "Variables",
    "columnHeader.latency": "Latency (ms)",
    "columnHeader.modelUsed": "Model",
    "columnHeader.status": "Status",
    "columnHeader.promptName": "Prompt Name",
    "columnHeader.user": "User",
    "columnHeader.traceId": "Trace ID",
    "columnHeader.date": "Date",
    success: "Success",
    fail: "Failed",
  };
  return translations[key] || key;
};

const meta: Meta<typeof RequestTable> = {
  title: "Sections/RequestTable",
  component: RequestTable,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    filterMode: {
      control: "radio",
      options: ["client", "server"],
    },
    paginationMode: {
      control: "radio",
      options: ["client", "server"],
    },
    sortingMode: {
      control: "radio",
      options: ["client", "server"],
    },
  },
};

export default meta;

type Story = StoryObj<typeof RequestTable>;

// Basic story with client-side filtering (default)
export const Default: Story = {
  args: {
    loading: false,
    requests: requests,
    t,
    filterMode: "client",
    paginationMode: "client",
    sortingMode: "client",
  },
};

// Loading state
export const Loading: Story = {
  args: {
    loading: true,
    requests: [],
    t,
  },
};

// Empty state
export const Empty: Story = {
  args: {
    loading: false,
    requests: [],
    t,
  },
};

// Server-side filtering with interactive demo
const ServerSideFilteringDemo = () => {
  const [loading, setLoading] = useState(false);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Simulate server-side filtering
  const filteredData = useMemo(() => {
    let result = [...requestsLarge];

    // Apply filters
    filterModel.items.forEach((filter) => {
      if (!filter.value && filter.value !== 0) return;

      result = result.filter((row) => {
        const value = row[filter.field as keyof Request];
        const filterValue = filter.value;

        switch (filter.operator) {
          case "contains":
            return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
          case "equals":
            return String(value).toLowerCase() === String(filterValue).toLowerCase();
          case "startsWith":
            return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
          case "endsWith":
            return String(value).toLowerCase().endsWith(String(filterValue).toLowerCase());
          case ">":
            return Number(value) > Number(filterValue);
          case ">=":
            return Number(value) >= Number(filterValue);
          case "<":
            return Number(value) < Number(filterValue);
          case "<=":
            return Number(value) <= Number(filterValue);
          case "=":
            return Number(value) === Number(filterValue);
          case "!=":
            return Number(value) !== Number(filterValue);
          default:
            return true;
        }
      });
    });

    // Apply sorting
    if (sortModel.length > 0) {
      const { field, sort } = sortModel[0];
      result.sort((a, b) => {
        const aVal = a[field as keyof Request];
        const bVal = b[field as keyof Request];
        if (aVal === bVal) return 0;
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const comparison = aVal < bVal ? -1 : 1;
        return sort === "desc" ? -comparison : comparison;
      });
    }

    return result;
  }, [filterModel, sortModel]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const start = page * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  const handleFilterChange = useCallback((model: GridFilterModel) => {
    setLoading(true);
    // Simulate API call delay
    setTimeout(() => {
      setFilterModel(model);
      setPage(0); // Reset to first page on filter change
      setLoading(false);
    }, 300);
  }, []);

  const handleSortChange = useCallback((model: GridSortModel) => {
    setLoading(true);
    setTimeout(() => {
      setSortModel(model);
      setLoading(false);
    }, 200);
  }, []);

  const handlePaginationChange = useCallback((newPage: number, newPageSize: number) => {
    setLoading(true);
    setTimeout(() => {
      setPage(newPage);
      setPageSize(newPageSize);
      setLoading(false);
    }, 200);
  }, []);

  return (
    <RequestTable
      loading={loading}
      requests={paginatedData}
      t={t}
      filterMode="server"
      paginationMode="server"
      sortingMode="server"
      filterModel={filterModel}
      onFilterChange={handleFilterChange}
      onSortChange={handleSortChange}
      onPaginationChange={handlePaginationChange}
      page={page}
      rowsPerPage={pageSize}
      totalRows={filteredData.length}
      onRowClick={(row) => console.log("Row clicked:", row)}
    />
  );
};

export const ServerSideFiltering: Story = {
  render: () => <ServerSideFilteringDemo />,
  parameters: {
    docs: {
      description: {
        story: `
This story demonstrates server-side filtering, sorting, and pagination.

**Features:**
- Filter by any column using the column menu (click the 3-dot menu on column headers)
- Sort by clicking column headers
- Paginate through 100 records
- All operations simulate server-side processing with loading states

**Try these filters:**
- Filter "Model" column contains "gpt"
- Filter "Cost" > 0.01
- Filter "Status" equals "Success"
- Sort by "Latency (ms)" descending
        `,
      },
    },
  },
};

// Large dataset with client-side filtering
export const LargeDataset: Story = {
  args: {
    loading: false,
    requests: requestsLarge,
    t,
    filterMode: "client",
    paginationMode: "client",
    sortingMode: "client",
  },
  parameters: {
    docs: {
      description: {
        story: "A large dataset with 100 records using client-side filtering and pagination.",
      },
    },
  },
};

// With row click handler
export const WithRowClick: Story = {
  args: {
    loading: false,
    requests: requests,
    t,
    onRowClick: (row: Request) => {
      alert(`Clicked row: ${row.id}\nInput: ${row.input}`);
    },
  },
  parameters: {
    docs: {
      description: {
        story: "Click on any row to see the row data in an alert.",
      },
    },
  },
};

// With errors
export const WithErrors: Story = {
  args: {
    loading: false,
    requests: requests.filter((r) => r.status === "2" || Math.random() > 0.5),
    t,
  },
  parameters: {
    docs: {
      description: {
        story: "Shows a mix of successful and failed requests.",
      },
    },
  },
};
