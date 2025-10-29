import { ScoreData } from "@/sections/traces/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";

interface EvaluationContextValue {
  scores: ScoreData[];
  isLoading: boolean;
  openAddAnnotationDialog: boolean;
  setOpenAddAnnotationDialog: (open: boolean) => void;
  canAddAnnotation: boolean;
  fetchEvaluationsCallback?: (spanId: string) => Promise<void>;
}

const EvaluationContext = createContext<EvaluationContextValue | undefined>(
  undefined
);

export const useEvaluationContext = () => {
  const context = useContext(EvaluationContext);
  if (!context) {
    throw new Error(
      "useEvaluationContext must be used within EvaluationProvider"
    );
  }
  return context;
};

export const EvaluationProvider = ({
  children,
  canAddAnnotation,
  fetchEvaluations,
}: {
  children: React.ReactNode;
  canAddAnnotation: boolean;
  fetchEvaluations?: (spanId: string) => Promise<ScoreData[]>;
}) => {
  const [openAddAnnotationDialog, setOpenAddAnnotationDialog] = useState(false);
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { selectedSpan } = useTraceDrawerContext();

  useEffect(() => {
    if (selectedSpan?.id) {
      fetchEvaluationsCallback(selectedSpan.id);
    }
  }, [selectedSpan?.id]);

  const fetchEvaluationsCallback = useCallback(
    async (spanId: string) => {
      setIsLoading(true);
      if (fetchEvaluations) {
        const scores = await fetchEvaluations(spanId);
        setScores(scores);
      }
      setIsLoading(false);
    },
    [fetchEvaluations]
  );

  return (
    <EvaluationContext.Provider
      value={{
        scores,
        isLoading,
        openAddAnnotationDialog,
        setOpenAddAnnotationDialog,
        canAddAnnotation,
        fetchEvaluationsCallback,
      }}
    >
      {children}
    </EvaluationContext.Provider>
  );
};
