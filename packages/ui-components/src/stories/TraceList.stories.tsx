import {
  TraceListItem,
  TraceListProvider,
  useTraceListContext,
} from "@/sections";
import type { Meta, StoryObj } from "@storybook/react";
import { traces } from "./mocks";
import { Card, Table, TableBody, TableContainer } from "@mui/material";
import { TableHeadCustom } from "@/components";

const meta: Meta<typeof TraceListProvider> = {
  title: "Sections/TraceList",
  component: TraceListProvider,
  tags: ["autodocs"],
  parameters: {},
};

export default meta;

type Story = StoryObj<typeof TraceListProvider>;

export const Default: Story = {
  args: {
    traces: traces,
    children: (
      <Card>
        <TableContainer>
          <Table>
            <TableHeadCustom
              headLabel={[
                { id: "name", label: "Name" },
                { id: "status", label: "Status" },
                { id: "latency", label: "Latency" },
                { id: "cost", label: "Cost" },
                { id: "tokens", label: "Tokens" },
                { id: "timestamp", label: "Timestamp" },
              ]}
            />
            <TableBody>
              <TraceItems />
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    ),
  },
};

function TraceItems() {
  const { traces } = useTraceListContext();
  return traces.map((trace) => (
    <TraceListItem key={trace.id} trace={trace} onClick={() => {}} />
  ));
}
