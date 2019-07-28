/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
  // 父组件的vm实例
  const renderContext = parentVnode && parentVnode.context
  // options._renderChildren 是父组件中包裹的内容
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  // 通过编译生产的render 调用createElement创建VNode
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  // 通过option传入的render 调用createElement创建VNode
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  // 把$attrs $listeners 变成响应式的  开发环境中有一些回调输出警告信息
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  // render函数
  Vue.prototype._render = function (): VNode {
    // 把this赋给局部变量vm
    const vm: Component = this
    // 实例化子组件的时候 可以拿到_parentVnode占位符节点
    // 获取到render函数  和 父vnode
    const { render, _parentVnode } = vm.$options

    // reset _rendered flag on slots for duplicate slot check
    if (process.env.NODE_ENV !== 'production') {
      for (const key in vm.$slots) {
        // $flow-disable-line
        vm.$slots[key]._rendered = false
      }
    }

    if (_parentVnode) {
      vm.$scopedSlots = _parentVnode.data.scopedSlots || emptyObject
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    // 把父vnode赋给this.$vnode 就是占位符vnode
    vm.$vnode = _parentVnode
    // render self
    let vnode
    try {
      // 给render方法传入 createElement函数用于创建VNode
      // render函数的参数是 createElement函数 返回值是一个vnode
      // src/core/instance/init.js
      // _renderProxy 生产环境是vm实例
      // 开发环境是一个proxy对象通过has判断是否有要去访问的字段 或者 是否是一个关键字或者以_开头 没有就警告
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      // 调用render函数出错 打印日志 和 错误回调
      handleError(e, vm, `render`)
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        if (vm.$options.renderError) {
          try {
            // 如果生成vnode的时候有错误 就调用options的renderError方法
            vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
          } catch (e) {
            // 如果调用renderError出错打印日志 和 错误回调
            handleError(e, vm, `renderError`)
            vnode = vm._vnode
          }
        } else {
          vnode = vm._vnode
        }
      } else {
        // 因为本次渲染失败
        // 把上次渲染的_vnode 赋值给 vnode当做本次渲染的vnode
        vnode = vm._vnode
      }
    }
    // return empty vnode in case the render function errored out
    // 最后生成的vnode不是Vnode的实例 就返回一个空的vnode
    if (!(vnode instanceof VNode)) {
      // 如果是一个数组 就报错 因为只能有一个根节点
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      // 创建一个空的vnode
      vnode = createEmptyVNode()
    }
    // set parent
    // 设置vnode的父子关系  _parentVnode是占位符vnode
    vnode.parent = _parentVnode
    return vnode
  }
}
