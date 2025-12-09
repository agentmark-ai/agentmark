import { getInput, getOutput } from "../helpers";
import { expect, test } from 'vitest'
import { stringify, transform } from "../../index";
import { parse } from "../../ast-utils";

const props = {
  name1: 'Steve',
  company1: 'Toyota',
  address1: {
    street: "2 blueberry lane",
    city: "boston"
  },
  name2: 'Bob',
  company2: 'HubSpot',
  address2: {
    street: "1 blueberry lane",
    city: "nyc"
  }
};

test('replaces props', async () => {
  const input = getInput(__dirname);
  const tree = parse(input);
  const processed = await transform(tree, props);
  const compiled = stringify(processed);
  const output = getOutput(__dirname);
  expect(compiled).toEqual(output);
});