/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
export function createElement (
  context: Component,   // vm
  tag: any,             // 标签名
  data: any,            // vnode数据
  children: any,        // 子vnode
  normalizationType: any, // 序列化类型
  alwaysNormalize: boolean  // _c编译生成的传入false  createElement手写传入true
): VNode | Array<VNode> {
  // data可能为空 使得children赋值给了data 依次向前
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  // 手写render函数必须要全部的Normalize
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  // 真正创建vnode
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  // 如果data是一个响应式的 就报警告 然后返回一个空节点
  if (isDef(data) && isDef((data: any).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }
  // object syntax in v-bind
  // :is 如果为false 返回一个空节点
  // <component :is="xxx"> data下面会有is
  if (isDef(data) && isDef(data.is)) {
    // 把is的值赋给 tag 标签名
    tag = data.is
  }
  // 如果标签名 什么都不渲染 返回一个空节点
  if (!tag) {
    // in case of component :is set to falsy value
    // 翻译： is被设置了一个假值
    return createEmptyVNode()
  }
  // warn against non-primitive key
  // 非生成环境 定义了data  定义了data.key  key是一个复杂数据类型 报警告
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  // support single function children as default scoped slot
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }

  // 对children序列化 两种序列化类型
  if (normalizationType === ALWAYS_NORMALIZE) {
    // 把children拍平最后返回的是一个vnode数组
    // 层级结构的children变成一维数组 如果是基本数据类型 就前后合并创建一个文本vnode
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    // children 还是children 没有创建vnode
    // 只是展开一层
    children = simpleNormalizeChildren(children)
  }
  // 子节点处理完成后对 最外层的tag处理
  let vnode, ns
  // tag可以是一个字符串 标示为标签名 也可以是一个组件对象
  if (typeof tag === 'string') {
    // tag是一个标签
    let Ctor
    // 命名空间
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    // 如果是html/svg标签 已知的标签
    if (config.isReservedTag(tag)) {
      // 创建一个vnode 把所有子节点传入
      // platform built-in elements
      // parsePlatformTagName 平台相关的处理 web下就是一个入参等于返回值的函数  weex下有特殊处理
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if (isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // 如果通过全局注册、局部注册 $options.components中会有组件 能找到就创建
      // 异步组件 工厂函数的方式 也是能走到这里 Ctor是那个工厂函数  高级异步组件 promise等都是一样
      // component
      // 创建一个组件 占位符vnode
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      // 未知的标签 未列出命名空间的元素  一样创建vnode
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // tag是一个组件构造函数 或者 是一个组件的options
    // direct component options / constructor
    // 创建一个组件 占位符vnode
    vnode = createComponent(tag, data, context, children)
  }
  // vnode是一个数组 就直接返回
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    // 非数组情况
    // 有命名空间
    if (isDef(ns)) applyNS(vnode, ns)
    // 有vnode data
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    // vnode为null 或者 undefined 返回一个空节点
    return createEmptyVNode()
  }
}

// 不知道干什么用的
function applyNS (vnode, ns, force) {
  vnode.ns = ns
  // foreignObject 在svg中嵌入xml
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  // vnode有子节点
  if (isDef(vnode.children)) {
    // 遍历子节点
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
// 翻译：在slot节点上用 :style :class 当深层绑定的时候要确保父节点渲染
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
