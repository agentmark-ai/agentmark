import { memo, useMemo } from "react";
import {
  DataGrid as MuiDataGrid,
  DataGridProps,
  Toolbar,
  ColumnsPanelTrigger,
  FilterPanelTrigger,
} from "@mui/x-data-grid";
import { Iconify } from "@/components";
import { EmptyContent } from "@/components";

type CustomDataGridProps = DataGridProps & {
  t: any;
  emptyContentImgUrl?: string;
};

// Memoized toolbar to prevent re-creation on DataGrid re-renders
// This keeps the FilterPanelTrigger stable, preventing the filter popover
// from losing its anchor element when data or loading state changes
const DataGridToolbar = memo(function DataGridToolbar() {
  return (
    <Toolbar>
      <ColumnsPanelTrigger startIcon={<Iconify icon="solar:eye-bold" />}>
        Columns
      </ColumnsPanelTrigger>
      <FilterPanelTrigger startIcon={<Iconify icon="solar:filter-bold" />}>
        Filters
      </FilterPanelTrigger>
    </Toolbar>
  );
});

export const DataGrid = ({
  t,
  emptyContentImgUrl,
  ...props
}: CustomDataGridProps) => {
  // Memoize slots to prevent re-creation on every render
  const slots = useMemo(
    () => ({
      toolbar: DataGridToolbar,
      noRowsOverlay: () => (
        <EmptyContent
          sx={{ margin: 2 }}
          title={t("noResults")}
          imgUrl={emptyContentImgUrl}
        />
      ),
      noResultsOverlay: () => (
        <EmptyContent
          title={t("noResults")}
          sx={{ py: 10 }}
          imgUrl={emptyContentImgUrl}
        />
      ),
    }),
    [t, emptyContentImgUrl]
  );

  return (
    <MuiDataGrid
      sx={{ "--DataGrid-overlayHeight": "530px" }}
      {...props}
      slots={slots}
      slotProps={{
        loadingOverlay: {
          sx: {
            padding: 5,
          },
        },
        filterPanel: {
          sx: {
            maxWidth: "100vw",
          },
        },
        columnsPanel: {
          sx: {
            maxWidth: "100vw",
          },
        },
      }}
    />
  );
};
