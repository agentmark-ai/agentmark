import React from "react";
import { Box, SxProps, Theme } from "@mui/system";
import { UseFormReturn, FormProvider as Form } from "react-hook-form";

type Props = {
  children: React.ReactNode;
  methods: UseFormReturn<any>;
  onSubmit?: VoidFunction;
  sx?: SxProps<Theme>;
};

export default function FormProvider({
  children,
  onSubmit,
  methods,
  sx,
}: Props) {
  return (
    <Form {...methods}>
      <Box component="form" onSubmit={onSubmit} sx={sx}>
        {children}
      </Box>
    </Form>
  );
}