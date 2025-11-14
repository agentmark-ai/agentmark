import React from "react";
import { Controller, useFormContext } from "react-hook-form";

import { FormHelperText, Slider, SliderProps } from "@mui/material";

type Props = SliderProps & {
  name: string;
};

export default function RHFSlider({ name, ...other }: Props) {
  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState: { error } }) => (
        <div>
          <Slider {...field} {...other} />

          {!!error && (
            <FormHelperText error sx={{ px: 2, textAlign: "center" }}>
              {error.message}
            </FormHelperText>
          )}
        </div>
      )}
    />
  );
}
