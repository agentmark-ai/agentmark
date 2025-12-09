import { expect, test } from 'vitest'
import { stringify, transform } from "../../index";
import { parse } from "../../ast-utils";

const compile = async (input: string, props: any) => {
  const tree = parse(input);
  const processed = await transform(tree, props);
  const result = stringify(processed);
  return result;
}

test('handles missing condition props gracefully', async () => {
  // Test missing prop defaults to false (Else should render)
  const input1 = `
<If condition={props.missingCondition}>
  # This should not render
</If>
<Else>
  # Missing prop defaults to false
</Else>`;
  
  expect(await compile(input1, {}))
    .toEqual(`# Missing prop defaults to false\n`);

  // Test null prop defaults to false
  const input2 = `
<If condition={props.nullCondition}>
  # This should not render
</If>
<Else>
  # Null defaults to false
</Else>`;
  
  expect(await compile(input2, { nullCondition: null }))
    .toEqual(`# Null defaults to false\n`);

  // Test undefined prop defaults to false
  const input3 = `
<If condition={props.undefinedCondition}>
  # This should not render
</If>
<Else>
  # Undefined defaults to false
</Else>`;
  
  expect(await compile(input3, { undefinedCondition: undefined }))
    .toEqual(`# Undefined defaults to false\n`);

  // Test non-boolean prop defaults to false
  const input4 = `
<If condition={props.stringCondition}>
  # This should not render
</If>
<Else>
  # Non-boolean defaults to false
</Else>`;
  
  expect(await compile(input4, { stringCondition: "truthy string" }))
    .toEqual(`# Non-boolean defaults to false\n`);

  // Test ElseIf with missing condition
  const input5 = `
<If condition={false}>
  # This should not render
</If>
<ElseIf condition={props.missingCondition}>
  # This should also not render
</ElseIf>
<Else>
  # ElseIf missing condition defaults to false
</Else>`;
  
  expect(await compile(input5, {}))
    .toEqual(`# ElseIf missing condition defaults to false\n`);

  // Test that actual boolean values still work
  const input6 = `
<If condition={props.trueCondition}>
  # True condition renders
</If>
<Else>
  # This should not render
</Else>`;
  
  expect(await compile(input6, { trueCondition: true }))
    .toEqual(`# True condition renders\n`);

  const input7 = `
<If condition={props.falseCondition}>
  # This should not render
</If>
<Else>
  # False condition goes to else
</Else>`;
  
  expect(await compile(input7, { falseCondition: false }))
    .toEqual(`# False condition goes to else\n`);
});