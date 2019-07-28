/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

// 拿到数组的原型
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

// 可以修改数组本身的方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 遍历方法名
methodsToPatch.forEach(function (method) {
  // cache original method
  // 获取原有的方法
  const original = arrayProto[method]
  // Object.defineProperty 从新定义这个方法
  def(arrayMethods, method, function mutator (...args) {
    // 调用原始的数组方法
    const result = original.apply(this, args)
    // this就是array  拿到Observer
    const ob = this.__ob__
    // 对数组进行添加的方法
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 需要对新添加的元素做响应式处理
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 通知订阅者 更新
    // 解决调用数组方法set不会被调用的问题
    ob.dep.notify()
    return result
  })
})
