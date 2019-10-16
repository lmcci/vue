/* @flow */

import { escape } from 'web/server/util'
import { isObject, extend } from 'shared/util'
import { renderAttr } from 'web/server/modules/attrs'
import { renderClass } from 'web/util/class'
import { genStyle } from 'web/server/modules/style'
import { normalizeStyleBinding } from 'web/util/style'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from 'core/vdom/helpers/normalize-children'

import {
  propsToAttrMap,
  isRenderableAttr
} from 'web/server/util'

const ssrHelpers = {
  _ssrEscape: escape,
  _ssrNode: renderStringNode,
  _ssrList: renderStringList,
  _ssrAttr: renderAttr,
  _ssrAttrs: renderAttrs,
  _ssrDOMProps: renderDOMProps,
  _ssrClass: renderSSRClass,
  _ssrStyle: renderSSRStyle
}

export function installSSRHelpers (vm: Component) {
  if (vm._ssrNode) {
    return
  }
  let Vue = vm.constructor
  while (Vue.super) {
    Vue = Vue.super
  }
  extend(Vue.prototype, ssrHelpers)
  if (Vue.FunctionalRenderContext) {
    extend(Vue.FunctionalRenderContext.prototype, ssrHelpers)
  }
}

class StringNode {
  isString: boolean;
  open: string;
  close: ?string;
  children: ?Array<any>;

  constructor (
    open: string,
    close?: string,
    children?: Array<any>,
    normalizationType?: number
  ) {
    // 初始化数据
    this.isString = true
    this.open = open
    this.close = close
    // 有子节点 根据序列化方式 拍平
    if (children) {
      this.children = normalizationType === 1
        ? simpleNormalizeChildren(children)
        : normalizationType === 2
          ? normalizeChildren(children)
          : children
    } else {
      this.children = void 0
    }
  }
}

function renderStringNode (
  open: string,
  close?: string,
  children?: Array<any>,
  normalizationType?: number
): StringNode {
  // 直接创建一个对象返回
  return new StringNode(open, close, children, normalizationType)
}

function renderStringList (
  val: any,
  render: (
    val: any,
    keyOrIndex: string | number,
    index?: number
  ) => string
): string {
  let ret = ''
  let i, l, keys, key
  // 是数组或者字符串 就遍历元素 调用render结果拼在ret上
  if (Array.isArray(val) || typeof val === 'string') {
    for (i = 0, l = val.length; i < l; i++) {
      ret += render(val[i], i)
    }
  } else if (typeof val === 'number') {
    // 是个数字 从0开始遍历 结果拼在ret上
    for (i = 0; i < val; i++) {
      ret += render(i + 1, i)
    }
  } else if (isObject(val)) {
    // 对象遍历 结果拼在ret上
    keys = Object.keys(val)
    for (i = 0, l = keys.length; i < l; i++) {
      key = keys[i]
      ret += render(val[key], key, i)
    }
  }
  return ret
}

// 遍历对象 所有元素调用renderAttr 结果拼在res上
function renderAttrs (obj: Object): string {
  let res = ''
  for (const key in obj) {
    res += renderAttr(key, obj[key])
  }
  return res
}

// 逐个调用 结果拼好返回
function renderDOMProps (obj: Object): string {
  let res = ''
  for (const key in obj) {
    const attr = propsToAttrMap[key] || key.toLowerCase()
    if (isRenderableAttr(attr)) {
      res += renderAttr(attr, obj[key])
    }
  }
  return res
}

// 渲染类名
function renderSSRClass (
  staticClass: ?string,
  dynamic: any
): string {
  const res = renderClass(staticClass, dynamic)
  return res === '' ? res : ` class="${escape(res)}"`
}

// 渲染样式
function renderSSRStyle (
  staticStyle: ?Object,
  dynamic: any,
  extra: ?Object
): string {
  const style = {}
  if (staticStyle) extend(style, staticStyle)
  if (dynamic) extend(style, normalizeStyleBinding(dynamic))
  if (extra) extend(style, extra)
  const res = genStyle(style)
  return res === '' ? res : ` style=${JSON.stringify(escape(res))}`
}
