import yaml from "js-yaml";

export function toFrontMatter(content: { [key: string]: any }): string {
  // Serialize with js-yaml — the same library templatedx uses to read the
  // frontmatter back (`yaml.load` in ast-utils.ts) — so the output always
  // round-trips. A hand-rolled emitter cannot: prop values pulled from a trace
  // can be page markdown that starts with `![](...)` (a YAML tag indicator),
  // embeds quotes, or spans multiple lines, all of which need quoting or a
  // block scalar. `yaml.dump` applies those rules; bare interpolation did not.
  //
  // - lineWidth: -1   — never wrap long scalars (URLs, page content) so the
  //                     emitted value is stable and diff-friendly.
  // - noRefs: true    — expand shared references instead of emitting `&anchor`
  //                     / `*alias`, which would be surprising in a prompt file.
  // - skipInvalid: true — drop non-representable values (e.g. `undefined`)
  //                     rather than throw in the save path; the old emitter
  //                     would have written the literal string "undefined".
  const body =
    Object.keys(content).length === 0
      ? ""
      : yaml.dump(content, { lineWidth: -1, noRefs: true, skipInvalid: true });

  return `---\n${body}---\n`;
}
