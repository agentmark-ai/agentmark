import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { ScoreData } from "@/sections/traces/types";
import { EvaluationItem } from "./evaluation-item";
import { useEvaluationContext } from "./evaluation-provider";
import { EvaluationSkeleton } from "./evaluation-skeleton";
import TableNoData from "@/components/table/table-no-data";

export const EvaluationList = ({
  emptyContentImgUrl,
}: {
  emptyContentImgUrl?: string;
}) => {
  const { scores, isLoading } = useEvaluationContext();
  const { t } = useTraceDrawerContext();

  if (isLoading) {
    return <EvaluationSkeleton />;
  }

  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t("evaluationName")}</TableCell>
              <TableCell>{t("evaluationScore")}</TableCell>
              <TableCell>{t("evaluationLabel")}</TableCell>
              <TableCell>{t("evaluationReason")}</TableCell>
              <TableCell width={120}>Source</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {scores.map((scoreData: ScoreData, index: number) => (
              <EvaluationItem
                key={index}
                name={scoreData.name}
                score={scoreData.score}
                label={scoreData.label}
                reason={scoreData.reason}
                source={scoreData.source}
              />
            ))}
            <TableNoData
              title={t("noEvaluationData")}
              sx={{ p: 3 }}
              notFound={!isLoading && scores.length === 0}
              imgUrl={emptyContentImgUrl}
            />
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
