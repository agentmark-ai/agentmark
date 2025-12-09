import { ForEachPlugin, Tags as ForEachTags } from './tag-plugins/for-each';
import { ConditionalPlugin, Tags as ConditionalTags } from './tag-plugins/conditional';
import { RawPlugin, Tags as RawTags } from './tag-plugins/raw';
import { TagPluginRegistry } from './tag-plugin-registry';

import { FilterRegistry } from "./filter-registry";
import {
  capitalize,
  upper,
  lower,
  truncate,
  abs,
  join,
  round,
  replace,
  urlencode,
  dump,
} from "./filter-plugins";


TagPluginRegistry.register(new ForEachPlugin(), ForEachTags);
TagPluginRegistry.register(new ConditionalPlugin(), ConditionalTags);
TagPluginRegistry.register(new RawPlugin(), RawTags);

FilterRegistry.register("capitalize", capitalize);
FilterRegistry.register("upper", upper);
FilterRegistry.register("lower", lower);
FilterRegistry.register("truncate", truncate);
FilterRegistry.register("abs", abs);
FilterRegistry.register("join", join);
FilterRegistry.register("round", round);
FilterRegistry.register("replace", replace);
FilterRegistry.register("urlencode", urlencode);
FilterRegistry.register("dump", dump)