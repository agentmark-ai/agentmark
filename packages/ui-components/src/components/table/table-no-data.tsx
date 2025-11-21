import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import { Theme, SxProps } from "@mui/material/styles";

import { EmptyContent } from "../empty-content";

type Props = {
  notFound: boolean;
  sx?: SxProps<Theme>;
  title: string;
  imgUrl?: string;
};

export default function TableNoData({ title, notFound, sx, imgUrl }: Props) {
  return (
    <TableRow>
      {notFound ? (
        <TableCell colSpan={12}>
          <EmptyContent
            filled
            title={title}
            sx={{
              py: 10,
              ...sx,
            }}
            imgUrl={imgUrl}
          />
        </TableCell>
      ) : (
        <TableCell colSpan={12} sx={{ p: 0 }} />
      )}
    </TableRow>
  );
}
