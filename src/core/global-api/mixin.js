/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  // 全局的mixin
  Vue.mixin = function (mixin: Object) {
    // this.options ==> Vue.options
    // 通过merge的方式 把minxin的参数和options合并 然后赋值给options
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
