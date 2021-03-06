const path = require('path');
const slsw = require('serverless-webpack');

module.exports = {
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  entry: slsw.lib.entries,

  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
  },

  target: 'node',

  module: {
    rules: [{
      test: /\.tsx?$/,
      use: 'ts-loader',
      include: path.join(__dirname, 'lambda'),
      exclude: /node_modules/,
    }],
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
};
