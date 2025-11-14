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
import { EmptyContent } from "@/components";
import { EvaluationItem } from "./evaluation-item";
import { useEvaluationContext } from "./evaluation-provider";

export const EvaluationList = () => {
  const { scores, isLoading } = useEvaluationContext();
  const { t } = useTraceDrawerContext();

  if (!isLoading && scores.length === 0) {
    return <EmptyContent title={t("noEvaluationData")} />;
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
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
