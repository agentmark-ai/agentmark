---
'create-agentmark': patch
---

fix(create-agentmark): the CLI ran as a silent no-op via npm/npx — realpath both sides of the entry check

v1.0.0's `isDirectlyInvoked()` guard compared `import.meta.url` against
`pathToFileURL(process.argv[1])` without realpath-ing either side. npm and
npx invoke bins through a `node_modules/.bin` symlink, so the two URLs never
matched: `npm create agentmark` exited 0 having printed nothing and written
nothing. (macOS additionally symlinks /tmp, so even direct invocations
failed in temp directories.) Both sides are now realpath'd, and a regression
test invokes the built bin through a `node_modules/.bin`-style symlink — the
exact path every real user takes.
