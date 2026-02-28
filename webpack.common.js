const path = require('path');

module.exports = {
  entry: {
    app: './js/app.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: './js/[name].[contenthash:8].js',
    chunkFilename: './js/[id].[contenthash:8].js',
  },
};
