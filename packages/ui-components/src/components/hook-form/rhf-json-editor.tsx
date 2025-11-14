import React from "react";
import { ComponentProps } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { JsonEditor } from "@/components";
import { Stack } from "@mui/system";
import { FormHelperText } from "@mui/material";

type Props = ComponentProps<typeof JsonEditor> & {
  name: string;
};

export default function RHFJsonEditor({ name, ...other }: Props) {
  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: {ref, ...rest}, fieldState: { error } }) => (
        <Stack>
          <JsonEditor
            {...rest}
            value={rest.value}
            onChange={rest.onChange}
            {...other}
          />
          {!!error && (
            <FormHelperText error sx={{ px: 2 }}>
              {error.message}
            </FormHelperText>
          )}
        </Stack>
      )}
    />
  );
}