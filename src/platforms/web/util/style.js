/* @flow */

import { cached, extend, toObject } from 'shared/util'

// 把属性字符串根据正则分割成一个对象  键是样式名 值是样式的内容字符串
export const parseStyleText = cached(function (cssText) {
  const res = {}
  const listDelimiter = /;(?![^(]*\))/g
  const propertyDelimiter = /:(.+)/
  // 把字符串根据属性分割符正则 分割成数组并遍历
  cssText.split(listDelimiter).forEach(function (item) {
    if (item) {
      var tmp = item.split(propertyDelimiter)
      tmp.length > 1 && (res[tmp[0].trim()] = tmp[1].trim())
    }
  })
  return res
})

// merge static and dynamic style data on the same vnode
// 合并动态样式和静态样式
function normalizeStyleData (data: VNodeData): ?Object {
  // 获取动态绑定的样式
  const style = normalizeStyleBinding(data.style)
  // static style is pre-processed into an object during compilation
  // and is always a fresh object, so it's safe to merge into it
  // 如果有静态样式就合并后返回 否则就只返回动态绑定样式
  // extend单纯的合并两个对象
  return data.staticStyle
    ? extend(data.staticStyle, style)
    : style
}

// normalize possible array / string values into Object
// 获取动态绑定的样式
export function normalizeStyleBinding (bindingStyle: any): ?Object {
  // 如果是一个数组 就把数组里面的每一项可遍历的内容合并到一个对象上返回
  if (Array.isArray(bindingStyle)) {
    return toObject(bindingStyle)
  }
  // 如果是一个字符串 调用parseStyleText转换成对象返回
  if (typeof bindingStyle === 'string') {
    return parseStyleText(bindingStyle)
  }
  // 其他数据类型 直接返回
  return bindingStyle
}

/**
 * parent component style should be after child's
 * so that parent component's style could override it
 */
// 把当前节点样式 和 父节点样式获取出来变成对象 并返回
// 可以指定是否要遍历子节点获取子节点样式对象
export function getStyle (vnode: VNodeWithData, checkChild: boolean): Object {
  const res = {}
  let styleData

  // 是否要遍历子节点
  if (checkChild) {
    let childNode = vnode
    while (childNode.componentInstance) {
      childNode = childNode.componentInstance._vnode
      // 把子节点的样式获取出来 添加到res上
      if (
        childNode && childNode.data &&
        (styleData = normalizeStyleData(childNode.data))
      ) {
        extend(res, styleData)
      }
    }
  }

  // 把当前节点的样式获取出来添加到res上
  if ((styleData = normalizeStyleData(vnode.data))) {
    extend(res, styleData)
  }

  let parentNode = vnode
  while ((parentNode = parentNode.parent)) {
    // 把父节点的样式获取出来放在res上
    if (parentNode.data && (styleData = normalizeStyleData(parentNode.data))) {
      extend(res, styleData)
    }
  }
  return res
}

