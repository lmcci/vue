/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // 在原型上挂载_init方法 function Vue(){} 中有调用
  Vue.prototype._init = function (options?: Object) {
    // 定义一个局部变量 vm 指向this
    const vm: Component = this
    // a uid
    // 给this添加一个_uid  uid是自增的 每实例一个Vue对象就加1
    vm._uid = uid++

    // 性能埋点
    // 实例化开始的时候
    let startTag, endTag
    /* istanbul ignore if */
    // 如果定义了全局config.performance
    // mark是window.performance.mark的包装
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      // 开始标签 结束标签赋值
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      // 调用mark
      mark(startTag)
    }

    // a flag to avoid this being observed
    // 设置一个标记
    vm._isVue = true
    // merge options
    // 通过new Vue(options) 传入的option合并 最终挂载在this.$options上
    if (options && options._isComponent) {
      // 如果是组件的实例化 合并options
      // 组件实例化vm的时候options会传入{_isComponent: true, _parentVnode: vnode, parent}
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 把传入的option 合并放到$options上
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // new Vue(options) 的时候返回的是Vue.options
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    // 开发阶段有判断是否有这个属性
    if (process.env.NODE_ENV !== 'production') {
      // 开发阶段通过Proxy的方式包裹一层 为了输出警告信息
      initProxy(vm)
    } else {
      //  生产阶段直接把vm赋值_renderProxy
      vm._renderProxy = vm
    }
    // expose real self
    // _self引用指向自身
    vm._self = vm
    // 初始化操作
    initLifecycle(vm)
    initEvents(vm)
    // 初始化渲染
    initRender(vm)
    // 在调用beforeCreate之前没有执行initState所以拿不到data
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    // 初始化数据  props  methods  data  computed  watch
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    // 已经initState所以能拿到data
    callHook(vm, 'created')

    /* istanbul ignore if */
    // 非生成环境性能埋点
    // 实例化结束的时候
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      // 通过获取options.name 标签名 文件名 一系列降级 最终生成一个组件名称
      vm._name = formatComponentName(vm, false)
      // 最终调用 window.performance 下的方法，
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }
    // 有没有传入el  当时组件vnode的时候不在这里执行mount
    if (vm.$options.el) {
      // 执行挂载
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 创建一个原始的options 根据Vue的options和组件定义的options合并
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  // _parentVnode 就是父占位符vnode
  const parentVnode = options._parentVnode
  opts.parent = options.parent // 当前要创建子组件vm的父级vm实例
  opts._parentVnode = parentVnode

  // 合并一些其他属性
  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  // 获取合并过后的options
  let options = Ctor.options
  // 如果是Vue.extend生成的构造函数 应该有super
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const extended = Ctor.extendOptions
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = dedupe(latest[key], extended[key], sealed[key])
    }
  }
  return modified
}

function dedupe (latest, extended, sealed) {
  // compare latest and sealed to ensure lifecycle hooks won't be duplicated
  // between merges
  if (Array.isArray(latest)) {
    const res = []
    sealed = Array.isArray(sealed) ? sealed : [sealed]
    extended = Array.isArray(extended) ? extended : [extended]
    for (let i = 0; i < latest.length; i++) {
      // push original options and not sealed options to exclude duplicated options
      if (extended.indexOf(latest[i]) >= 0 || sealed.indexOf(latest[i]) < 0) {
        res.push(latest[i])
      }
    }
    return res
  } else {
    return latest
  }
}
