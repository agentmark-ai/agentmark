# Quickstart: Trace Timeline View

**Feature**: 002-trace-timeline
**Date**: 2026-01-06

## Prerequisites

- Node.js 18+
- Yarn
- AgentMark CLI installed (`npx create-agentmark@latest`)

## Quick Setup

```bash
# Clone and checkout feature branch
git checkout 002-trace-timeline

# Install dependencies
yarn

# Start CLI dev server (uses SQLite locally)
cd packages/cli
yarn dev
```

## Usage

### In TraceDrawer (CLI and Cloud)

The timeline integrates into the existing trace drawer sidebar:

```tsx
import {
  TraceTimeline,
  TraceDrawerSidebar,
  useTraceDrawerContext
} from "@agentmark/ui-components";

function TraceDrawer() {
  const { spans, selectedSpan, onSelectSpan } = useTraceDrawerContext();
  const [view, setView] = useState<'graph' | 'timeline'>('graph');

  return (
    <TraceDrawerSidebar>
      <TraceTree />
      <TraceDrawerSidebarSectionResizer />

      <ViewToggle value={view} onChange={setView} />

      {view === 'timeline' ? (
        <TraceTimeline
          spans={spans}
          selectedSpanId={selectedSpan?.id}
          onSelectSpan={onSelectSpan}
          showRuler
          showLegend
        />
      ) : (
        <TraceGraphCanvas spans={spans} />
      )}
    </TraceDrawerSidebar>
  );
}
```

### Standalone Component

```tsx
import { TraceTimeline } from "@agentmark/ui-components";

function MyComponent({ spans }) {
  const [selectedId, setSelectedId] = useState<string>();

  return (
    <TraceTimeline
      spans={spans}
      selectedSpanId={selectedId}
      onSelectSpan={setSelectedId}
      sx={{ height: 400, width: '100%' }}
    />
  );
}
```

### Using Hooks Directly

```tsx
import {
  useTimelineLayout,
  useTimelineZoom
} from "@agentmark/ui-components";

function CustomTimeline({ spans }) {
  const { layouts, metrics, rulerTicks } = useTimelineLayout(spans);
  const { viewState, zoomIn, zoomOut, panHandlers, onWheel } = useTimelineZoom();

  return (
    <svg
      viewBox={`${viewState.viewBox.x} ${viewState.viewBox.y} ${viewState.viewBox.width} ${viewState.viewBox.height}`}
      onWheel={onWheel}
      {...panHandlers}
    >
      {layouts.map(layout => (
        <TimelineBar key={layout.spanId} {...layout} />
      ))}
    </svg>
  );
}
```

## Component API

### TraceTimeline

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `spans` | `SpanData[]` | required | Spans to visualize |
| `selectedSpanId` | `string` | - | Currently selected span |
| `onSelectSpan` | `(id) => void` | - | Selection callback |
| `showRuler` | `boolean` | `true` | Show time axis |
| `showLegend` | `boolean` | `true` | Show type legend |
| `enableZoom` | `boolean` | `true` | Enable mouse wheel zoom |
| `enablePan` | `boolean` | `true` | Enable drag to pan |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Focus timeline |
| `↑` / `↓` | Navigate spans |
| `Enter` | Select focused span |
| `+` / `-` | Zoom in/out |
| `0` | Reset zoom |

## Testing

```bash
# Run tests
cd packages/ui-components
yarn test trace-timeline

# With coverage
yarn test --coverage trace-timeline
```

## Troubleshooting

### Timeline not rendering

Ensure spans have valid `timestamp` and `duration`:

```tsx
console.log(spans.map(s => ({
  id: s.id,
  timestamp: s.timestamp,
  duration: s.duration
})));
```

### Colors not matching graph

Both views should use `getNodeTypeStyle()`. Verify imports:

```tsx
import { getNodeTypeStyle } from '../utils/node-styling';
```

### Selection not syncing

Check that `onSelectSpan` is connected to the shared context:

```tsx
const { onSelectSpan } = useTraceDrawerContext();
```
