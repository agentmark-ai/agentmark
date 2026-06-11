/**
 * The JUnit formatter moved to @agentmark-ai/prompt-core so the SDK can emit the
 * identical report (rendering is now single-sourced alongside the gate). This
 * module re-exports it to preserve the CLI's existing `../utils/junit-formatter`
 * import path.
 */
export { buildJUnitXml, buildJUnitReport, isRegression } from "@agentmark-ai/prompt-core";
export {
  escapeXmlAttribute,
  escapeXmlText,
  wrapCdata,
  stringifyForXml,
} from "@agentmark-ai/prompt-core/internal";
export type {
  JUnitRow,
  JUnitEval,
  JUnitSuiteOptions,
  JUnitReport,
  ScoreThresholdResult,
} from "@agentmark-ai/prompt-core";
