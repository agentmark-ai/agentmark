import { expect, test } from 'vitest'
import { stringify, transform } from "../../index";
import { parse } from "../../ast-utils";

const input = `
<If condition={props.isVisible}>
  # Condition1
</If>
<ElseIf condition={props.num == 2}>
  # Condition2
</ElseIf>
<Else>
  <If condition={props.isNestedVisible}>
    # Nested Condition 1
  </If>
  <Else>
    # Nested Default
  </Else>
  # Default
</Else>`;

const compile = async (props: any) => {
  const tree = parse(input);
  const processed = await transform(tree, props);
  const result = stringify(processed);
  return result;
}
test('handles conditionals', async () => {
  expect(await compile({ isVisible: true, isNestedVisible: false, num: 4 }))
    .toEqual(`# Condition1\n`);
  expect(await compile({ isVisible: false, isNestedVisible: false, num: 2 }))
    .toEqual(`# Condition2\n`);
  expect(await compile({ isVisible: false, isNestedVisible: true, num: 3 }))
    .toEqual(`# Nested Condition 1\n\n# Default\n`);
  expect(await compile({ isVisible: false, isNestedVisible: false, num: 3 }))
    .toEqual(`# Nested Default\n\n# Default\n`);
});