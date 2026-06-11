/**
 * `@agentmark-ai/prompt-core/internal` — implementation details shared with
 * first-party packages (the CLI's JUnit formatter). NOT a stable public API:
 * no semver guarantees beyond the AgentMark packages released together.
 */
export {
  escapeXmlAttribute,
  escapeXmlText,
  wrapCdata,
  stringifyForXml,
} from "./junit";
