/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  // 挂载use方法 为了使用插件
  Vue.use = function (plugin: Function | Object) {
    // 获得已经安装的插件 没有的时候使用一个空数组
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = []))
    // 已经注册过 就直接返回
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 除去第一个参数 把剩余的转成一个数组
    const args = toArray(arguments, 1)
    // 把Vue添加到数组头部  args就是调用install的时候传入的参数
    args.unshift(this)

    if (typeof plugin.install === 'function') {
      // 如果有install函数就调用
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') {
      // 如果本身就是一个函数调用一次
      plugin.apply(null, args)
    }
    // 把当前插件放在已经安装的插件数组中 避免重复安装
    installedPlugins.push(plugin)
    return this
  }
}
