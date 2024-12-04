# PromptDX Loader

A webpack loader for PromptDX files

1. `yarn add @puzzlet/promptdx-loader` or `npm install @puzzlet/promptdx-loader`
2. Add to webpack config.

```js
module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.prompt.mdx$/,
        use: '@puzzlet/promptdx-loader',
      },
    ],
  },
  target: 'node',
  ... // Other config
};
```