# Feature Specification: Agentic Workflow Graph

**Feature Branch**: `001-auto-graph-nodes`
**Created**: 2025-12-10
**Status**: Draft
**Input**: User description: "Currently users must manually add metadata (graph.node.id, graph.node.display_name, graph.node.type, graph.node.parent_id) to each span for the graph view to work. We want to automatically generate graph nodes from trace data without requiring manual metadata."

## Clarifications

### Session 2025-12-10

- Q: For traces exceeding the performance threshold, what behavior should the system exhibit? → A: Render all spans (no limit) - rely on existing layout performance
- Q: What is the intended graph structure? → A: Agentic Workflow Graph - spans are grouped by name (with tool name for tool calls) under each parent, showing execution flow patterns rather than 1:1 span-to-node mapping
- Q: How should spans be grouped into nodes? → A: By span name under the same parent (tool calls will have tool name as span name after normalizer fix, so no special handling needed)
- Q: What do edges represent? → A: Execution transitions between operations (A→B means A executed before B)
- Q: How should clicking a node with multiple spans work? → A: Cycle through the grouped spans, selecting a different span each click
- Q: Should nodes with only 1 span show a count badge? → A: No badge for single spans (show badge only for ×2+)

### Session 2025-12-11

- Q: How are tool call spans currently named in the normalizer? → A: Tool call spans need normalizer fix - assign tool name to span name so grouping works correctly (e.g., span name becomes "search_web" instead of generic "toolCall")
- Q: How should SDK/version variance in tool call span naming be handled? → A: Normalizer handles all SDK/version variance (outputs consistent tool name as span.name)
- Q: What loading/empty states should the graph component show? → A: Loading skeleton while processing; "No workflow data" message for empty results
- Q: What keyboard accessibility should the graph support? → A: Basic keyboard nav (Tab to focus, arrow keys between nodes, Enter to select)
- Q: How should selection state be indicated for multi-span nodes? → A: Show position indicator (e.g., "2/5") displaying current span index

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Agentic Workflow Graph (Priority: P1)

As a developer using AgentMark, I want to see a visual workflow graph that shows the execution pattern of my AI agent, so that I can understand how my agent orchestrates LLM calls and tool usage without manually adding graph metadata.

**Why this priority**: This is the core value proposition. The workflow graph reveals the agent's decision-making pattern (e.g., "LLM → tool → LLM loop") at a glance, which is more valuable than seeing every individual span.

**Independent Test**: Can be fully tested by creating a trace with an agent that calls generateText and multiple tools, then verifying the graph displays grouped nodes with execution flow edges.

**Acceptance Scenarios**:

1. **Given** an agent trace with spans [generateText, toolCall:search, generateText, toolCall:search, generateText], **When** I open the graph view, **Then** I see 2 nodes (generateText ×3, search ×2) with bidirectional edges showing the execution flow.

2. **Given** an agent trace with no graph.node.* metadata, **When** I view the trace, **Then** the workflow graph displays automatically without any empty state or error.

3. **Given** an agent that uses 3 different tools, **When** I view the graph, **Then** each tool appears as a separate node (grouped by tool name), connected by edges showing which operations transitioned to which.

---

### User Story 2 - Navigate to Spans via Graph Nodes (Priority: P1)

As a developer, I want to click on a workflow node to navigate to the corresponding span in the trace view, so that I can drill down from the high-level workflow to specific execution details.

**Why this priority**: The graph is only useful if it connects to the underlying data. Without click-to-navigate, the graph is just a picture with no actionable value.

**Independent Test**: Can be tested by clicking nodes in the graph and verifying the trace view scrolls to and highlights the corresponding span.

**Acceptance Scenarios**:

1. **Given** a node representing 3 generateText spans, **When** I click the node once, **Then** the first generateText span is selected in the trace view.

2. **Given** a node representing 3 generateText spans and I've clicked once, **When** I click the same node again, **Then** the second generateText span is selected (cycling through spans).

3. **Given** a node representing 3 spans and I've clicked 3 times, **When** I click the node a 4th time, **Then** the selection cycles back to the first span.

---

### User Story 3 - Nested Agent Subgraphs (Priority: P2)

As a developer, I want to see nested agents as contained subgraphs within their parent agent's graph, so that I can understand the hierarchical structure of complex multi-agent systems.

**Why this priority**: Many AI applications use nested agents (e.g., a router agent calling specialized sub-agents). Showing this hierarchy makes complex traces comprehensible.

**Independent Test**: Can be tested by creating a trace with a parent agent that spawns child agents, verifying the graph shows nested containers.

**Acceptance Scenarios**:

1. **Given** an agent A that calls sub-agent B which has its own generateText and tool calls, **When** I view the graph, **Then** agent B appears as a container node within A's graph, with B's internal workflow visible inside.

2. **Given** nested agents 3 levels deep, **When** I view the graph, **Then** each level is visually contained within its parent, maintaining clear hierarchy.

---

### User Story 4 - Automatic Node Type Detection (Priority: P2)

As a developer, I want nodes to automatically display appropriate icons and colors based on the operation type (LLM, tool, agent, etc.), so that I can quickly distinguish different operation types in the workflow.

**Why this priority**: Visual differentiation improves graph readability. Users expect LLM nodes to look different from tool nodes.

**Independent Test**: Can be tested by creating spans with different types and verifying correct icons appear.

**Acceptance Scenarios**:

1. **Given** a node grouping generateText spans, **When** the graph is rendered, **Then** the node displays with the "llm" type icon and styling.

2. **Given** a node grouping tool call spans, **When** the graph is rendered, **Then** the node displays with the "tool" type icon and styling.

3. **Given** a node representing a sub-agent, **When** the graph is rendered, **Then** the node displays with the "agent" type icon and container styling.

---

### User Story 5 - Span Count Badge (Priority: P3)

As a developer, I want to see how many times each operation executed (e.g., "×3" badge on a node), so that I can understand the iteration count at a glance.

**Why this priority**: Knowing that generateText ran 5 times vs 1 time provides insight into agent behavior without clicking through. Nice-to-have but not critical.

**Independent Test**: Can be tested by creating nodes with varying span counts and verifying badges display correctly.

**Acceptance Scenarios**:

1. **Given** a node representing 5 spans, **When** the graph is rendered, **Then** the node displays a "×5" badge.

2. **Given** a node representing 1 span, **When** the graph is rendered, **Then** no badge is displayed.

---

### Edge Cases

- What happens when a span has no name? System should fall back to span type or a generic "Operation" label.
- What happens when tool calls have no tool name? System should use span name alone for grouping.
- How does the system handle very large traces (1000+ spans)? System renders all nodes without limits, relying on existing layout performance.
- What happens when there's only one span under a parent? Display as a single node with no count badge.
- How are parallel branches handled? Spans that don't have sequential transitions appear as separate nodes without edges between them.
- What if two different parent spans have children with the same name? They are grouped separately (grouping is per-parent).

### Loading & Empty States

- **Loading**: Display a loading skeleton while span-to-node transformation is processing.
- **Empty**: Show "No workflow data" message when trace has no spans to visualize.

## Requirements *(mandatory)*

### Functional Requirements

**Node Generation:**
- **FR-001**: System MUST automatically generate workflow graph nodes by grouping spans with the same name under the same parent span.
- **FR-002**: ~~System MUST group tool call spans by span name + tool name combination.~~ **Simplified**: Tool call spans will have tool name as their span name (via normalizer), so standard grouping by span name applies uniformly.
- **FR-003**: System MUST generate a unique node ID based on parent span ID + span name.
- **FR-004**: System MUST display a span count badge (×N) only when a node represents 2 or more spans; no badge for single-span nodes.

**Edge Generation:**
- **FR-005**: System MUST create edges based on execution order transitions between grouped operations under the same parent.
- **FR-006**: System MUST create bidirectional edges when operations transition in both directions (A→B and B→A both occurred).
- **FR-007**: System MUST NOT create edges between nodes that never had sequential transitions.

**Navigation:**
- **FR-008**: System MUST select the corresponding span in the trace view when a user clicks a graph node.
- **FR-009**: System MUST cycle through grouped spans on repeated clicks of the same node.
- **FR-010**: System MUST visually indicate which span is currently selected for multi-span nodes by displaying a position indicator (e.g., "2/5").

**Accessibility:**
- **FR-017**: System MUST support Tab key to focus the graph container.
- **FR-018**: System MUST support arrow keys to navigate between nodes when graph is focused.
- **FR-019**: System MUST support Enter key to select/activate the currently focused node.

**Hierarchy:**
- **FR-011**: System MUST render child agents/spans with their own children as nested subgraphs within the parent graph.
- **FR-012**: System MUST maintain visual containment hierarchy for nested agents.

**Type Detection:**
- **FR-013**: System MUST infer node type from span attributes (GENERATION type → "llm", tool calls → "tool", spans with children → "agent").
- **FR-014**: System MUST apply appropriate icon and color styling based on detected node type.

**Backward Compatibility:**
- **FR-015**: System MUST preserve and prioritize manually specified graph.node.* metadata over auto-generated values when present.
- **FR-016**: System MUST maintain backward compatibility with existing traces that use manual graph metadata.

### Key Entities

- **Span**: The fundamental unit of trace data containing execution information, timing, name, tool information, and parent relationship.
- **WorkflowNode**: A grouped representation of one or more spans with the same name (and tool name for tool calls) under the same parent. Contains nodeId, displayName, nodeType, spanIds[], and parentNodeId.
- **WorkflowEdge**: A directional or bidirectional connection between WorkflowNodes representing execution flow transitions.
- **NodeGroup**: The grouping key for spans: `{parentSpanId, spanName}` (simplified - no toolName needed after normalizer fix).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of new traces display a workflow graph without requiring any manual graph.node.* metadata.
- **SC-002**: Users can identify the agent's execution pattern (e.g., "LLM-tool loop") within 5 seconds of viewing the graph.
- **SC-003**: Click-to-navigate works for 100% of nodes, correctly selecting the appropriate span.
- **SC-004**: Graph view loads within 2 seconds for traces with up to 100 unique span operations.
- **SC-005**: Existing traces with manual graph metadata continue to work identically (zero regression).
- **SC-006**: Node type detection is correct for 90%+ of standard AI SDK patterns (generateText, tool calls, streamText, etc.).

## Assumptions

- Spans always have a valid spanId and parentSpanId that can be used for grouping.
- Span names are meaningful and consistent within an agent's execution (e.g., all LLM calls use "generateText").
- Tool calls include tool name information in span attributes or metadata.
- The existing React Flow / Dagre rendering pipeline can be adapted for workflow graphs with grouped nodes.
- Execution order can be determined from span start timestamps.

## Platform Architecture

This feature must work across two platforms:

| Platform | Database | Data Layer | Frontend |
|----------|----------|------------|----------|
| **CLI (Local)** | SQLite (better-sqlite3) | Express API routes | Next.js + ui-components |
| **Cloud** | ClickHouse | Cube.js | Next.js + ui-components |

**Design Constraint**: The auto-graph generation logic MUST be implemented in `ui-components` (frontend) so it works with both platforms. The backend only provides raw span data; the frontend transforms spans into workflow graph nodes/edges.

**Shared Components**:
- `ui-components`: Graph rendering, node grouping, edge generation (platform-agnostic)
- `shared-utils`: Normalizer types, span interfaces (used by both platforms)

## Prerequisites

- **Normalizer Enhancement Required**: The shared-utils normalizer must be updated to assign tool names to span names for tool call spans. Currently tool call spans may have a generic name (e.g., "toolCall") instead of the specific tool name (e.g., "search_web"). This fix is required for proper node grouping by tool type.
- **SDK/Version Variance Handling**: The normalizer must handle SDK-specific and version-specific differences in how tool call spans are named. All variance is isolated within the normalizer's transformer layer; the graph generator receives consistent `span.name = toolName` output regardless of source SDK or version.

## Out of Scope

- Customization of grouping rules via user configuration.
- Animation showing execution order/timing.
- Filtering or hiding specific node types from the graph.
- Export of graph as image or diagram format.
- Changes to span collection or instrumentation.
