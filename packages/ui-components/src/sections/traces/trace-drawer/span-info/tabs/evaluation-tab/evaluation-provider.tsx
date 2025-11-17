import { ScoreData } from "@/sections/traces/types";
import {
  createContext,
  useContext,
  useState,
} from "react";

interface EvaluationContextValue {
  scores: ScoreData[];
  isLoading: boolean;
  openAddAnnotationDialog: boolean;
  setOpenAddAnnotationDialog: (open: boolean) => void;
  canAddAnnotation: boolean;
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
  scores,
  isLoading,
}: {
  children: React.ReactNode;
  canAddAnnotation: boolean;
  scores: ScoreData[];
  isLoading: boolean;
}) => {
  const [openAddAnnotationDialog, setOpenAddAnnotationDialog] = useState(false);

  return (
    <EvaluationContext.Provider
      value={{
        scores,
        isLoading,
        openAddAnnotationDialog,
        setOpenAddAnnotationDialog,
        canAddAnnotation,
      }}
    >
      {children}
    </EvaluationContext.Provider>
  );
};
