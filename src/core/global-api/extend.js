/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  // 传入一个对象 返回一个构造函数
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    // this代表Vue 不是vm
    const Super = this
    const SuperId = Super.cid

    // 第一次给传入的option加入一个空对象 然后缓存  第二次直接取缓存
    // 缓存是放在传入的extendOptions中的
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})

    // 如果对象有缓存 就直接返回
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 传入的option中的name然后校验 若没传就用Vue的
    const name = extendOptions.name || Super.options.name
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }

    // 创建构造函数
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // 修改原型指向 把原型指向Super就是Vue
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    // cid递增 给了Sub而不是Vue 和SuperId无关
    Sub.cid = cid++
    // 合并传入的option和Vue的option
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    // 把super指向Vue
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 如果定义了props/computed就用Proxy代理props/computed
    if (Sub.options.props) {
      initProps(Sub)
    }
    // 初始化组件构造器的时候 判断是否有computed属性
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 缓存构造函数
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  // 遍历所有的computed 定义到组件构造器原型上
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
