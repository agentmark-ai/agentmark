// Generated using webpack-cli https://github.com/webpack/webpack-cli

const path = require('path');

const config = {
  entry: "./mdx/index.js",

  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },

  module: {
    rules: [
      {
        test: /\.mdx?$/,
        loader: "./dist/index.js",
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: [".js", ".mdx"],
  },
};
module.exports = () => {
  config.mode = "production";
  return config;
};
