/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  // 'component', 'directive', 'filter'
  // 遍历着往Vue上添加
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      // 如果definition为false 证明用户想要获取 而不是设置 所以就直接从options中获取返回
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        // 要设置的

        // 非生产环境 要注册全局组件的 要校验一下组件名
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        // 全局注册组件
        if (type === 'component' && isPlainObject(definition)) {
          // 如果组件指定了name就使用 没有就用传入的id
          definition.name = definition.name || id
          // src/core/global-api/index.js   Vue.options._base = Vue
          // 使用Vue.extend() 来生成一个构造器
          // 这里的this 是 Vue
          definition = this.options._base.extend(definition)
        }
        // 定义指令
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 这里的this 是 Vue
        // 在Vue.options上添加 'components', 'directives', 'filters' 对应的构造器
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
