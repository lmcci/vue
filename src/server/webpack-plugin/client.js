const hash = require('hash-sum')
const uniq = require('lodash.uniq')
import { isJS } from './util'

// 一个类 客户端运行的时候执行  插件类
export default class VueSSRClientPlugin {
  constructor (options = {}) {
    // 创建的时候可以可以传入一些选项
    // filename 有默认设置
    this.options = Object.assign({
      filename: 'vue-ssr-client-manifest.json'
    }, options)
  }

  apply (compiler) {
    compiler.plugin('emit', (compilation, cb) => {
      const stats = compilation.getStats().toJson()

      // 资源文件去重
      const allFiles = uniq(stats.assets
        .map(a => a.name))

      // 从入口文件开始，获得所有文件 再过滤掉非js文件 再去重
      const initialFiles = uniq(Object.keys(stats.entrypoints)
        .map(name => stats.entrypoints[name].assets)
        .reduce((assets, all) => all.concat(assets), [])
        .filter(isJS))

      // 一些资源文件不在依赖中 说明是要异步下载的
      const asyncFiles = allFiles
        .filter(isJS)
        .filter(file => initialFiles.indexOf(file) < 0)

      // 创建一个清单文件对象
      const manifest = {
        publicPath: stats.publicPath,
        all: allFiles,
        initial: initialFiles,
        async: asyncFiles,
        modules: { /* [identifier: string]: Array<index: number> */ }
      }

      // 有assets的module
      const assetModules = stats.modules.filter(m => m.assets.length)
      // 函数 可以从清单文件中获得索引
      const fileToIndex = file => manifest.all.indexOf(file)
      stats.modules.forEach(m => {
        // ignore modules duplicated in multiple chunks
        // 多个块的直接忽略掉
        if (m.chunks.length === 1) {
          // 拿到第一个块
          const cid = m.chunks[0]
          const chunk = stats.chunks.find(c => c.id === cid)
          // 不存在 或者 没有对应的文件 直接返回什么都不做
          if (!chunk || !chunk.files) {
            return
          }
          // 获得每个file对应的索引 放在清单文件对应的modules中
          const files = manifest.modules[hash(m.identifier)] = chunk.files.map(fileToIndex)
          // find all asset modules associated with the same chunk
          // 遍历有assets的module
          assetModules.forEach(m => {
            // 有id和当前module相同的
            if (m.chunks.some(id => id === cid)) {
              // 也要把索引添加到files中
              files.push.apply(files, m.assets.map(fileToIndex))
            }
          })
        }
      })

      // const debug = (file, obj) => {
      //   require('fs').writeFileSync(__dirname + '/' + file, JSON.stringify(obj, null, 2))
      // }
      // debug('stats.json', stats)
      // debug('client-manifest.json', manifest)

      // 把清单文件对象转换成字符串
      const json = JSON.stringify(manifest, null, 2)
      // 添加到compilation 可获取json字符串 和 大小
      compilation.assets[this.options.filename] = {
        source: () => json,
        size: () => json.length
      }
      cb()
    })
  }
}
