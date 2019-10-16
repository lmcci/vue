import { validate, isJS } from './util'

// 一个类 服务端运行的时候执行  插件类
export default class VueSSRServerPlugin {
  constructor (options = {}) {
    // 创建的时候可以可以传入一些选项
    // filename 有默认设置
    this.options = Object.assign({
      filename: 'vue-ssr-server-bundle.json'
    }, options)
  }

  apply (compiler) {
    // 验证一下webpack配置
    validate(compiler)

    // webpack 传出emit时 执行回调
    compiler.plugin('emit', (compilation, cb) => {
      // 获取各个模块的状态
      const stats = compilation.getStats().toJson()
      // 总入口第一个
      const entryName = Object.keys(stats.entrypoints)[0]
      // 入口是个对象的时候
      const entryInfo = stats.entrypoints[entryName]

      // 没有入口就直接调用回调 什么都不做
      if (!entryInfo) {
        // #5553
        return cb()
      }

      // 过滤入口资源 不是js的
      const entryAssets = entryInfo.assets.filter(isJS)

      // 入口js大于1个 就直接报错
      if (entryAssets.length > 1) {
        throw new Error(
          `Server-side bundle should have one single entry file. ` +
          `Avoid using CommonsChunkPlugin in the server config.`
        )
      }

      // 取得唯一的入口js路径
      const entry = entryAssets[0]
      // 没有或者 不是字符串 抛异常
      if (!entry || typeof entry !== 'string') {
        throw new Error(
          `Entry "${entryName}" not found. Did you specify the correct entry option?`
        )
      }

      // 初始化一个对象
      const bundle = {
        entry,
        files: {},
        maps: {}
      }

      // 遍历资源
      stats.assets.forEach(asset => {
        if (asset.name.match(/\.js$/)) {
          // 是js 就往bundle.files里面添加 具体的文件代码
          bundle.files[asset.name] = compilation.assets[asset.name].source()
        } else if (asset.name.match(/\.js\.map$/)) {
          // map文件 转换成json 添加到map中
          bundle.maps[asset.name.replace(/\.map$/, '')] = JSON.parse(compilation.assets[asset.name].source())
        }
        // do not emit anything else for server
        // 删除
        delete compilation.assets[asset.name]
      })

      // 把bundle转换成字符串
      const json = JSON.stringify(bundle, null, 2)
      // 传入配置的filename
      const filename = this.options.filename

      // 添加到compilation 可以调用获得 大小和代码
      compilation.assets[filename] = {
        source: () => json,
        size: () => json.length
      }

      cb()
    })
  }
}
