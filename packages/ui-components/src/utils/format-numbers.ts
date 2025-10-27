import numeral from "numeral";

// ----------------------------------------------------------------------

type InputValue = string | number | null;

function isValidNumber(value: InputValue): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function fNumber(number: InputValue, showDecimals: boolean = false) {
  if (showDecimals) {
    const format = isValidNumber(number)
      ? numeral(number).format("0,0.[00]")
      : "";
    return result(format, ".[00]");
  }

  return isValidNumber(number) ? numeral(number).format() : "";
}

export function fCurrency(number: InputValue, fractionDigits: number = 2) {
  const fractionFormat = `.${"0".repeat(fractionDigits)}`;

  const format = isValidNumber(number)
    ? numeral(number).format(`$0,0${fractionFormat}`)
    : "";

  return result(format, fractionFormat);
}

export function fPercent(number: InputValue) {
  const format = isValidNumber(number)
    ? numeral(Number(number) / 100).format("0.0%")
    : "";

  return result(format, ".0");
}

export function fShortenNumber(number: InputValue) {
  const format = isValidNumber(number) ? numeral(number).format("0.00a") : "";

  return result(format, ".00");
}

export function fData(number: InputValue) {
  const format = isValidNumber(number) ? numeral(number).format("0.0 b") : "";

  return result(format, ".0");
}

function result(format: string, key = ".00") {
  const isInteger = format.includes(key);

  return isInteger ? format.replace(key, "") : format;
}
