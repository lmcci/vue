/* @flow */

import { isDef, isObject } from 'shared/util'

// 生成vnode的class
export function genClassForVnode (vnode: VNodeWithData): string {
  let data = vnode.data
  let parentNode = vnode
  let childNode = vnode
  // 向下遍历子节点
  while (isDef(childNode.componentInstance)) {
    childNode = childNode.componentInstance._vnode
    if (childNode && childNode.data) {
      // 把当前和子节点的staticClass class合并
      data = mergeClassData(childNode.data, data)
    }
  }
  // 向上遍历到根
  while (isDef(parentNode = parentNode.parent)) {
    if (parentNode && parentNode.data) {
      // 把当前和父节点的staticClass class合并
      data = mergeClassData(data, parentNode.data)
    }
  }
  // 把staticClass class 完全拍平 用空格拼接 返回
  return renderClass(data.staticClass, data.class)
}

// 返回一个对象
// staticClass 是子节点 和父节点的staticClass完全拍平 用空格拼接的字符串
// class 是子节点和父节点的class数组  如果子节点没有class就返回父节点的class
function mergeClassData (child: VNodeData, parent: VNodeData): {
  staticClass: string,
  class: any
} {
  return {
    staticClass: concat(child.staticClass, parent.staticClass),
    class: isDef(child.class)
      ? [child.class, parent.class]
      : parent.class
  }
}

// 完全拍平 数组拼接值， 对象拼接键， 字符串拼接本身
export function renderClass (
  staticClass: ?string,
  dynamicClass: any
): string {
  if (isDef(staticClass) || isDef(dynamicClass)) {
    // 最终返回的是一个字符串 把所有的内容拼接起来中间用空格拼接
    return concat(staticClass, stringifyClass(dynamicClass))
  }
  /* istanbul ignore next */
  // 两个都是空 就返回空串
  return ''
}

// 链接两个字符串 中间用空格隔开
// 如果其中有一个是空字符串就返回另一个
// 都是空字符串 返回空字符串
export function concat (a: ?string, b: ?string): string {
  return a ? b ? (a + ' ' + b) : a : (b || '')
}

// 把传入的对象转换成string
export function stringifyClass (value: any): string {
  // 当前值是数组 调用stringifyArray
  if (Array.isArray(value)) {
    return stringifyArray(value)
  }
  // 当前值是非null对象 调用stringifyObject
  if (isObject(value)) {
    return stringifyObject(value)
  }
  // 是string就返回本身
  if (typeof value === 'string') {
    return value
  }
  /* istanbul ignore next */
  return ''
}

// 把数组转换成string
function stringifyArray (value: Array<any>): string {
  let res = ''
  let stringified
  // 遍历数组
  for (let i = 0, l = value.length; i < l; i++) {
    // 把当前元素通过 stringifyClass 转换 如果非空字符串 非undefined 非null 就拼接
    // stringifyClass相当于递归
    if (isDef(stringified = stringifyClass(value[i])) && stringified !== '') {
      if (res) res += ' '
      res += stringified
    }
  }
  return res
}

// 把对象的所有键拼接成一个字符串中间用空格分隔 返回
function stringifyObject (value: Object): string {
  let res = ''
  // 遍历对象
  for (const key in value) {
    // 判断这个值是否存在 非0 非undefined
    if (value[key]) {
      if (res) res += ' ' // 判断是否是第一个
      res += key
    }
  }
  return res
}
