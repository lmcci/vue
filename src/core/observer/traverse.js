/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  // 先执行_traverse 然后清理集合
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  // 非数组且非对象   已经被冻结的对象   vnode实例 什么都不做直接返回
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  // 把dep.id作为键 存入 seen的集合中
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    // 如果已经存储过 就直接返回
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  // val[i]  val[keys[i]]  就是为了触发每一个属性的getter 从而收集依赖
  if (isA) {
    // 数组就继续递归
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    // 对象 就取得所有keys数组然后遍历
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
