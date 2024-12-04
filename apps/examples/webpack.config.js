const path = require('path');

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
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mdx'],
  },
};
