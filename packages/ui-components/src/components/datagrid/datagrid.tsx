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

export const DataGrid = ({
  t,
  emptyContentImgUrl,
  ...props
}: CustomDataGridProps) => {
  return (
    <MuiDataGrid
      sx={{ "--DataGrid-overlayHeight": "530px" }}
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
