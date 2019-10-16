const { red, yellow } = require('chalk')

// 输出log前缀
const prefix = `[vue-server-renderer-webpack-plugin]`
// 警告红色
const warn = exports.warn = msg => console.error(red(`${prefix} ${msg}\n`))
// 提示黄色
const tip = exports.tip = msg => console.log(yellow(`${prefix} ${msg}\n`))

// 验证配置信息
export const validate = compiler => {
  // target必须执行node
  if (compiler.options.target !== 'node') {
    warn('webpack config `target` should be "node".')
  }

  // output.libraryTarget 必须是 commonjs2
  // commonjs
  if (compiler.options.output && compiler.options.output.libraryTarget !== 'commonjs2') {
    warn('webpack config `output.libraryTarget` should be "commonjs2".')
  }

  // 推荐要配置options.externals
  if (!compiler.options.externals) {
    tip(
      'It is recommended to externalize dependencies in the server build for ' +
      'better build performance.'
    )
  }
}

export { isJS, isCSS } from '../util'
