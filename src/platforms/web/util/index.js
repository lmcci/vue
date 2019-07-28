/* @flow */

import { warn } from 'core/util/index'

export * from './attrs'
export * from './class'
export * from './element'

/**
 * Query an element selector if it's not an element already.
 */
// 选择dom元素
export function query (el: string | Element): Element {
  if (typeof el === 'string') {
    // 如果选择器没有选中的元素 就创建一个div返回
    const selected = document.querySelector(el)
    if (!selected) {
      process.env.NODE_ENV !== 'production' && warn(
        'Cannot find element: ' + el
      )
      return document.createElement('div')
    }
    // 有选中的就返回选中的第一个元素 非querySelectorAll
    return selected
  } else {
    // 如果是一个元素 就直接返回
    return el
  }
}
