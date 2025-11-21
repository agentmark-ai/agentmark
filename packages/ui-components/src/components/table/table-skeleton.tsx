import Skeleton from "@mui/material/Skeleton";
import TableCell from "@mui/material/TableCell";
import TableRow, { TableRowProps } from "@mui/material/TableRow";

export default function TableSkeleton({ ...other }: TableRowProps) {
  return (
    <>
      <TableRow {...other}>
        <TableCell colSpan={12}>
          <Skeleton sx={{ width: "100%", height: 12 }} />
        </TableCell>
      </TableRow>
      <TableRow {...other}>
        <TableCell colSpan={12}>
          <Skeleton sx={{ width: "100%", height: 12 }} />
        </TableCell>
      </TableRow>
      <TableRow {...other}>
        <TableCell colSpan={12}>
          <Skeleton sx={{ width: "100%", height: 12 }} />
        </TableCell>
      </TableRow>
      <TableRow {...other}>
        <TableCell colSpan={12}>
          <Skeleton sx={{ width: "100%", height: 12 }} />
        </TableCell>
      </TableRow>
    </>
  );
}
