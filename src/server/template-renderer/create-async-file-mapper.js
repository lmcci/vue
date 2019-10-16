/* @flow */

/**
 * Creates a mapper that maps components used during a server-side render
 * to async chunk files in the client-side build, so that we can inline them
 * directly in the rendered HTML to avoid waterfall requests.
 */

import type { ClientManifest } from './index'

export type AsyncFileMapper = (files: Array<string>) => Array<string>;

export function createMapper (
  clientManifest: ClientManifest
): AsyncFileMapper {
  const map = createMap(clientManifest)
  // map server-side moduleIds to client-side files
  // 返回一个函数 调用的时候传入id数组 从上面map中取得文件列表 然后放在数组中返回
  return function mapper (moduleIds: Array<string>): Array<string> {
    const res = new Set()
    for (let i = 0; i < moduleIds.length; i++) {
      const mapped = map.get(moduleIds[i])
      if (mapped) {
        for (let j = 0; j < mapped.length; j++) {
          res.add(mapped[j])
        }
      }
    }
    // 二位数组
    return Array.from(res)
  }
}

// 获得一个map id到文件列表的映射
function createMap (clientManifest) {
  // 创建一个map key就是id 值就是对应的文件
  const map = new Map()
  Object.keys(clientManifest.modules).forEach(id => {
    map.set(id, mapIdToFile(id, clientManifest))
  })
  return map
}

// 通过id获得文件列表
function mapIdToFile (id, clientManifest) {
  const files = []
  // 取得具体的模块
  const fileIndices = clientManifest.modules[id]
  if (fileIndices) {
    // 遍历
    fileIndices.forEach(index => {
      const file = clientManifest.all[index]
      // only include async files or non-js assets
      // 非.js文件 或者 异步文件
      if (clientManifest.async.indexOf(file) > -1 || !(/\.js($|\?)/.test(file))) {
        files.push(file)
      }
    })
  }
  return files
}
