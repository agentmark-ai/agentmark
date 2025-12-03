import { useMemo } from "react";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { transformAttributes } from "../attribute-transformer";

interface UseSpanAttributesResult {
  rawAttributes: Record<string, any>;
  transformedAttributes: Record<string, any>;
  isLoading: boolean;
}

export const useSpanAttributes = (): UseSpanAttributesResult => {
  const { selectedSpan } = useTraceDrawerContext();

  const rawAttributes = useMemo(() => {
    if (!selectedSpan?.data?.attributes) return {};
    try {
      return JSON.parse(selectedSpan.data.attributes);
    } catch {
      return {};
    }
  }, [selectedSpan]);

  const transformedAttributes = useMemo(() => {
    return transformAttributes(rawAttributes, selectedSpan?.data);
  }, [rawAttributes, selectedSpan?.data]);

  return {
    rawAttributes,
    transformedAttributes,
    isLoading: !selectedSpan,
  };
};
