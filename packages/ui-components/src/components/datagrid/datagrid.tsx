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
};

export const DataGrid = ({ t, ...props }: CustomDataGridProps) => {
  return (
    <MuiDataGrid
      {...props}
      slots={{
        toolbar: () => {
          return (
            <Toolbar>
              <ColumnsPanelTrigger
                startIcon={<Iconify icon="solar:eye-bold" />}
              >
                Columns
              </ColumnsPanelTrigger>
              <FilterPanelTrigger
                startIcon={<Iconify icon="solar:filter-bold" />}
              >
                Filters
              </FilterPanelTrigger>
            </Toolbar>
          );
        },
        noRowsOverlay: () => (
          <EmptyContent sx={{ margin: 2 }} title={t("noResults")} />
        ),
        noResultsOverlay: () => (
          <EmptyContent title={t("noResults")} sx={{ py: 10 }} />
        ),
      }}
      slotProps={{
        loadingOverlay: {
          sx: {
            padding: 5,
          },
        },
      }}
    />
  );
};
