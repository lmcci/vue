/* @flow */

import VNode from '../vnode'
import { createFnInvoker } from './update-listeners'
import { remove, isDef, isUndef, isTrue } from 'shared/util'

export function mergeVNodeHook (def: Object, hookKey: string, hook: Function) {
  // 组件vnode的data中有hook 普通节点上没有
  // 如果没有就添加一个空对象
  if (def instanceof VNode) {
    def = def.data.hook || (def.data.hook = {})
  }
  let invoker
  // 获取原有vnode上的对应hook
  const oldHook = def[hookKey]

  // 调用一次 就删除掉
  function wrappedHook () {
    hook.apply(this, arguments)
    // important: remove merged hook to ensure it's called only once
    // and prevent memory leak
    // 保证下次不会被执行
    remove(invoker.fns, wrappedHook)
  }

  // 如果原来没有定义hook
  if (isUndef(oldHook)) {
    // no existing hook
    // 就创建一个
    // 把wrappedHook包装成数组调用createFnInvoker 返回一个函数 当invoker被调用的时候 wrappedHook也会被调用
    invoker = createFnInvoker([wrappedHook])
  } else {
    /* istanbul ignore if */
    // 之前已经执行过mergeVNodeHook 的时候  就再push进一个回调
    if (isDef(oldHook.fns) && isTrue(oldHook.merged)) {
      // already a merged invoker
      invoker = oldHook
      invoker.fns.push(wrappedHook)
    } else {
      // existing plain hook
      // 以前vnode.data 已经有了hook 就组成一个数组
      invoker = createFnInvoker([oldHook, wrappedHook])
    }
  }

  invoker.merged = true
  def[hookKey] = invoker
}
