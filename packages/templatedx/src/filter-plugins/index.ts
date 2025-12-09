import { FilterFunction } from '../filter-registry';

export interface Filters {
  capitalize: FilterFunction<string, string>;
  upper: FilterFunction<string, string>;
  lower: FilterFunction<string, string>;
  truncate: FilterFunction<string, string, [number]>;
  abs: FilterFunction<number, number>;
  join: FilterFunction<any[], string, [string?]>;
  round: FilterFunction<number, number, [number?]>;
  replace: FilterFunction<string, string, [string, string]>;
  urlencode: FilterFunction<string, string>;
  dump: FilterFunction<any, string>;
}

export const capitalize: Filters['capitalize'] = (input) => {
  if (typeof input !== "string") return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
};

export const upper: Filters['upper'] = (input) => {
  if (typeof input !== "string") return input;
  return input.toUpperCase();
};

export const lower: Filters['lower']= (input) => {
  if (typeof input !== "string") return input;
  return input.toLowerCase();
};

export const truncate: Filters['truncate'] = (input, length) => {
  if (typeof input !== "string") return input;
  if (input.length <= length) return input;
  return input.substring(0, length) + "...";
};

export const abs: Filters['abs'] = (input) => {
  return Math.abs(input);
};

export const join: Filters['join'] = (input, separator = ", ") => {
  if (!Array.isArray(input)) return input;
  return input.join(separator);
};

export const round: Filters['round'] = (input, decimals = 0) => {
  return Number(Math.round(Number(input + "e" + decimals)) + "e-" + decimals);
};

export const replace: Filters['replace'] = (input, search, replace) => {
  if (typeof input !== "string") return input;
  return input.split(search).join(replace);
};

export const urlencode: Filters['urlencode']= (input) => {
  if (typeof input !== "string") return input;
  return encodeURIComponent(input);
};

export const dump: Filters['dump'] = (input) => {
  return JSON.stringify(input);
};
