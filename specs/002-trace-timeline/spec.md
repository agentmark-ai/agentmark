# Feature Specification: Trace Timeline View

**Feature Branch**: `002-trace-timeline`
**Created**: 2026-01-06
**Status**: Draft
**Input**: User description: "Create a timeline view for trace spans, following industry standards for telemetry-based apps (Datadog, Jaeger, New Relic waterfall views)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Span Execution Timeline (Priority: P1)

As a developer using AgentMark, I want to see a horizontal timeline (waterfall view) showing when each span executed and how long it took, so that I can understand timing relationships and identify performance bottlenecks at a glance.

**Why this priority**: This is the core value proposition - understanding trace timing visually. The workflow graph shows execution flow/patterns, but the timeline shows timing/duration. Together they provide complete trace understanding.

**Independent Test**: Can be fully tested by opening any trace with multiple spans and verifying the timeline accurately represents span timing relationships.

**Acceptance Scenarios**:

1. **Given** a trace with 5 spans of varying durations, **When** the user opens the trace timeline view, **Then** all spans appear as horizontal bars positioned according to their start time relative to the trace start, with bar widths proportional to duration.

2. **Given** a trace with parallel spans (two child spans starting at similar times under the same parent), **When** the user views the timeline, **Then** both spans appear on separate rows at the same horizontal position, clearly showing concurrent execution.

3. **Given** a trace with sequential spans (one span starting after another ends), **When** the user views the timeline, **Then** spans appear in sequence without overlap, showing the handoff between operations.

4. **Given** a span with 500ms duration in a trace totaling 2 seconds, **When** the user views the timeline, **Then** the span bar visually occupies approximately 25% of the timeline width.

---

### User Story 2 - Identify Performance Bottlenecks (Priority: P1)

As a developer troubleshooting slow agent responses, I want to quickly identify which span(s) are causing delays, so that I can focus optimization efforts on the right operations.

**Why this priority**: Bottleneck identification is the primary use case for timeline views in APM tools. This directly enables performance optimization workflows.

**Independent Test**: Can be tested by viewing a trace with one unusually slow span and verifying it stands out visually.

**Acceptance Scenarios**:

1. **Given** a trace where one span takes 80% of total duration, **When** the user views the timeline, **Then** the slow span is visually prominent due to its proportionally large bar width.

2. **Given** a trace with nested spans, **When** the user views the timeline, **Then** child spans appear indented or nested under their parent, showing the call hierarchy while maintaining time alignment.

3. **Given** a trace with a failed span (error status), **When** the user views the timeline, **Then** the failed span is visually distinguished (e.g., different color or indicator) to draw attention to errors.

---

### User Story 3 - Navigate Between Timeline and Span Details (Priority: P2)

As a developer, I want to click on a span in the timeline to see its details (attributes, input/output, scores), so that I can drill down from timing overview to specific execution details.

**Why this priority**: Timeline is for overview; details require the existing detail views. Seamless navigation between them creates a complete debugging workflow.

**Independent Test**: Can be tested by clicking a span in the timeline and verifying the detail panel updates correctly.

**Acceptance Scenarios**:

1. **Given** a timeline with multiple spans displayed, **When** the user clicks on a span bar, **Then** the span detail panel updates to show that span's attributes, input/output, and scores.

2. **Given** a span is selected in the timeline, **When** the user clicks a different span, **Then** the selection moves to the new span and the detail panel updates accordingly.

3. **Given** the timeline view is open, **When** the user selects a span in the existing TraceTree sidebar, **Then** the timeline highlights/scrolls to show that span's position.

---

### User Story 4 - Understand Time Distribution by Operation Type (Priority: P2)

As a developer, I want to see how total trace time breaks down across different operation types (LLM calls, tool calls, custom spans), so that I can understand where time is being spent.

**Why this priority**: Understanding time distribution helps prioritize optimization efforts. Builds on core timeline functionality.

**Independent Test**: Can be tested by viewing a trace with multiple span types and verifying visual differentiation.

**Acceptance Scenarios**:

1. **Given** a trace with spans of different types (LLM, tool, agent), **When** the user views the timeline, **Then** span bars are color-coded by span type with a legend explaining the colors.

2. **Given** the timeline is displayed, **When** the user hovers over a span bar, **Then** a tooltip shows the span name, duration, and percentage of total trace time.

---

### User Story 5 - Zoom and Pan Long Traces (Priority: P3)

As a developer investigating a long-running trace (many seconds or minutes), I want to zoom into specific time ranges to see detail, so that I can navigate large traces effectively.

**Why this priority**: Long traces can have dozens or hundreds of spans. Without zoom/pan, the timeline becomes unusable. Lower priority because most traces are shorter.

**Independent Test**: Can be tested with a trace spanning 10+ seconds with 50+ spans.

**Acceptance Scenarios**:

1. **Given** a trace spanning 30 seconds with 100 spans, **When** the user zooms in to a 5-second window, **Then** span bars in that window expand to fill the viewport, showing more detail.

2. **Given** a zoomed-in timeline view, **When** the user pans left or right, **Then** the visible time window shifts to show earlier or later spans.

3. **Given** a zoomed-in view, **When** the user clicks a "fit all" or reset control, **Then** the timeline zooms out to show the entire trace duration.

---

### Edge Cases

- What happens when a trace has only one span? Display the single span as a full-width bar with duration label.
- What happens when spans have zero duration? Display as a thin vertical line or minimum-width bar at the correct time position.
- What happens when span timestamps indicate negative duration (end before start)? Display as a minimum-width bar with a warning indicator; data quality issue.
- How does the system handle traces with 1000+ spans? Implement virtualization to render only visible spans; show a summary when too compressed.
- What happens when a span's parent is missing from the trace data? Display the span at root level with an indicator that the parent is unknown.
- How does the system handle overlapping span names? Show truncated names with full name on hover; ensure bars are positioned correctly regardless of label length.

### Loading & Empty States

- **Loading**: Display a loading skeleton while timeline layout is being calculated.
- **Empty**: Show "No spans to display" message when trace has no spans.

## Requirements *(mandatory)*

### Functional Requirements

**Timeline Display:**
- **FR-001**: System MUST display trace spans as horizontal bars on a time axis, positioned by start time and sized by duration.
- **FR-002**: System MUST show hierarchical relationships between spans through visual nesting (indentation on the vertical axis).
- **FR-003**: System MUST display concurrent spans (siblings with overlapping time) on separate rows while maintaining time alignment.
- **FR-004**: System MUST display a time scale/ruler showing the trace time range with appropriate intervals.
- **FR-005**: System MUST show duration labels on spans (absolute time and/or percentage of trace total).

**Styling:**
- **FR-006**: System MUST color-code spans by type (LLM, tool, agent, etc.) using the same color scheme as the workflow graph.
- **FR-007**: System MUST visually distinguish spans with error status from successful spans.
- **FR-008**: System MUST show a tooltip on hover containing span name, duration, start time, and percentage of total trace time.
- **FR-009**: System MUST display a legend showing span type colors.

**Navigation:**
- **FR-010**: System MUST allow users to select a span by clicking its bar in the timeline.
- **FR-011**: System MUST synchronize span selection between the timeline, TraceTree, and detail panel.
- **FR-012**: System MUST scroll/highlight the selected span when selection changes from another view.

**Zoom/Pan:**
- **FR-013**: System MUST provide zoom controls to focus on specific time ranges.
- **FR-014**: System MUST provide pan controls to navigate across the time axis when zoomed.
- **FR-015**: System MUST provide a "fit all" control to reset zoom to show the entire trace.

**Performance:**
- **FR-016**: System MUST handle traces with many spans (100+) without significant visual degradation.
- **FR-017**: System MUST implement virtualization for very large traces (1000+ spans).

**Accessibility:**
- **FR-018**: System MUST support Tab key to focus the timeline container.
- **FR-019**: System MUST support arrow keys to navigate between spans when timeline is focused.
- **FR-020**: System MUST support Enter key to select the currently focused span.

### Key Entities

- **Span**: The fundamental unit of trace data containing execution information, timing, name, and parent relationship. Key attributes: id, name, duration, timestamp, parentId, status.
- **TimelineBar**: Visual representation of a span in the timeline. Contains x position (from start time), width (from duration), y position (from hierarchy), depth (nesting level), and color (from node type).
- **TimelineLayout**: The computed layout for all spans including row assignments, normalized positions, and ruler tick marks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify the longest-running span in a trace within 5 seconds of viewing the timeline (without manual calculation or sorting).
- **SC-002**: Users can determine whether two operations ran sequentially or in parallel within 3 seconds of viewing the timeline.
- **SC-003**: Users can navigate from timeline to span details with a single click.
- **SC-004**: Timeline view renders and becomes interactive within 2 seconds for traces with up to 100 spans.
- **SC-005**: Timeline accurately represents all span timing relationships - no visual misrepresentation of start times, durations, or parent-child hierarchy.
- **SC-006**: Span type colors are consistent between timeline and workflow graph views.

## Assumptions

- Span data includes valid timestamp and duration fields (milliseconds).
- The existing span normalization provides consistent data format across SDKs.
- The `inferNodeType()` function from 001-auto-graph-nodes can be reused for span type detection.
- The `getNodeTypeStyle()` function provides consistent colors for span types.
- Most traces have fewer than 200 spans; traces with 1000+ spans are rare edge cases.

## Platform Architecture

This feature must work across two platforms (same as 001-auto-graph-nodes):

| Platform | Database | Data Layer | Frontend |
|----------|----------|------------|----------|
| **CLI (Local)** | SQLite (better-sqlite3) | Express API routes | Next.js + ui-components |
| **Cloud** | ClickHouse | Cube.js | Next.js + ui-components |

**Design Constraint**: The timeline layout and rendering logic MUST be implemented in `ui-components` (frontend) so it works with both platforms. The backend only provides raw span data; the frontend transforms spans into timeline layout.

**Shared Components**:
- `ui-components`: Timeline rendering, layout calculation, zoom/pan (platform-agnostic)
- `shared-utils`: Normalizer types, span interfaces (used by both platforms)

## Relationship to 001-auto-graph-nodes

The timeline view complements the workflow graph:

| Aspect | Workflow Graph (001) | Timeline (002) |
|--------|---------------------|----------------|
| **Primary insight** | Execution flow/patterns | Timing/duration |
| **Grouping** | Spans grouped by name | Each span shown individually |
| **Layout** | DAG with edges | Horizontal bars on time axis |
| **Best for** | "What operations happened?" | "How long did each take?" |

Both views should:
- Use the same span type colors (`getNodeTypeStyle()`)
- Share span selection state

## View Layout Pattern

Following industry standards (Jaeger, Datadog, LangSmith), the TraceDrawer uses a **tab-based layout**:

```
┌─────────────────────────────────────────────────────────────┐
│ Trace Drawer Header                                         │
├────────────┬────────────────────────────────────────────────┤
│            │ [Timeline] [Graph] [Details]  ← Tab navigation │
│ TraceTree  │────────────────────────────────────────────────│
│ (always    │                                                │
│  visible   │  Full-width content based on selected tab      │
│  for nav)  │                                                │
└────────────┴────────────────────────────────────────────────┘
```

**Layout Behavior:**
- **TraceTree** (left sidebar, 280px): Always visible for span navigation
- **Timeline tab**: Full-width waterfall visualization with zoom/pan
- **Graph tab**: Full-width workflow graph showing execution flow
- **Details tab**: Full SpanInfo panel (Attributes, I/O, Evaluation)

**Navigation Flow:**
- Clicking a span in Timeline or Graph auto-switches to Details tab
- TraceTree selection highlights the span in whichever visualization is active
- Tab preference can be persisted to localStorage via `useTimelineViewPreference` hook

## Out of Scope

- Critical path highlighting (showing the longest path through the trace).
- Flame graph view (horizontal stacked bars by call depth).
- Comparison of multiple traces side-by-side.
- Export of timeline as image.
- Animation showing execution replay.
