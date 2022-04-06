import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';

export default {
  mode: 'production',
  target: ['web', 'es5'],
  entry: './node_modules/@emurgo/cardano-serialization-lib-asmjs/cardano_serialization_lib_bg.js',
  output: {
    filename: 'cardano.asm.js',
    path: dirname(fileURLToPath(import.meta.url)),
    library: {
      type: 'module',
    },
  },
  experiments: {
    outputModule: true,
    futureDefaults: true,
  },
  module: {
    rules: [{
      test: /\.m?js$/,
      exclude: [
        resolve(dirname(fileURLToPath(import.meta.url)), './node_modules/core-js/'),
        resolve(dirname(fileURLToPath(import.meta.url)), './node_modules/regenerator-runtime/'),
      ],
      use: {
        loader: 'babel-loader',
        options: {
          presets: [
            ['@babel/preset-env', {
              useBuiltIns: 'usage',
              corejs: '3.0',
              modules: false,
            }],
          ],
          compact: false,
          targets: 'defaults',
        },
      },
    }],
  },
  plugins: [
    new webpack.ProgressPlugin(),
  ],
  optimization: {
    innerGraph: false,
    splitChunks: false,
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
  node: {
    global: true,
    __filename: 'mock',
    __dirname: 'mock',
  },
};
