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
      }
    }
  }
})
