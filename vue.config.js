const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  transpileDependencies: true,
  css: {
    loaderOptions: {
      less: {
        // 属性值包裹在lessOptions内
        lessOptions: {
          javascriptEnabled: true
        }
      },
    },
  },
  configureWebpack: {
    /* 外部化 Node.js 模块 */
    externals: {
      'fs': 'commonjs fs',
      'path': 'commonjs path',
      'crypto': 'commonjs crypto',
      'stream': 'commonjs stream',
      'zlib': 'commonjs zlib',
      'http': 'commonjs http',
      'https': 'commonjs https',
      'os': 'commonjs os'
    },
    module: {
      rules: [
        {
          test: /\.wasm$/,
          type: 'webassembly/experimental',
        }
      ]
    },
    optimization: {
      minimizer: [
        (compiler) => {
          const { RawSource } = require('webpack-sources');
          compiler.hooks.emit.tap('IgnoreWasmMinify', (compilation) => {
            Object.keys(compilation.assets).forEach((key) => {
              if (key.endsWith('.wasm')) {
                compilation.assets[key] = new RawSource(compilation.assets[key].source());
              }
            });
          });
        }
      ]
    },
  },
})
