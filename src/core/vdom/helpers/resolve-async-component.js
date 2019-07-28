/* @flow */

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'

function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  // 创建一个空的vnode 上面挂载一些方法作为标记
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

// 异步组件
export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>,
  context: Component
): Class<Component> | void {
  // 高级异步组件 如果超时或者出错 并且定义了error组件 就返回error的构造函数
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  // 第一次不会走这里，第一次调用forceUpdate之后 会再次被调用 这个时候factory.resolved有值 并且是异步组件的构造函数
  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  // 高级异步组件 在loading中的时候 返回loading组件的构造函数
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (isDef(factory.contexts)) {
    // already pending
    factory.contexts.push(context)
  } else {
    // 工厂函数
    // context就是vm
    const contexts = factory.contexts = [context]
    let sync = true

    const forceRender = () => {
      // 遍历所有的vm然后执行 forceUpdate
      for (let i = 0, l = contexts.length; i < l; i++) {
        contexts[i].$forceUpdate()
      }
    }

    // once返回一个函数 保证这个函数只执行一次
    // 当加载js成功的时候会调用这个方法 入参就是那个异步组件
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      // 异步组件的构造函数
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        forceRender()
      }
    })

    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender()
      }
    })

    // factory 就是异步组件的工厂函数 resolve, reject是上面定义的两个函数
    const res = factory(resolve, reject)
    // 去异步加载资源 最后返回undefined

    if (isObject(res)) {
      // 使用promise方式加载异步组件的时候 执行这里
      if (typeof res.then === 'function') {
        // () => Promise
        // 如果没有加载完成的时候 通过.then传入resolve, reject  当promise返回的时候调用
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject)
        }
      } else if (isDef(res.component) && typeof res.component.then === 'function') {
        // 高级异步组件 执行这里
        // 高级异步组件 传入的是一个函数  函数的返回值是一个对象 对象中component是一个promise
        // loading是加载时显示的组件 error是加载出错时显示的组件
        // 通过上面的 const res = factory(resolve, reject) 这个时候 res已经是一个返回的对象了

        // 传入 resolve, reject  加载完成的时候回调
        res.component.then(resolve, reject)

        if (isDef(res.error)) {
          // 加载出错的 组件构造函数
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
          // 加载中的 组件构造函数
          factory.loadingComp = ensureCtor(res.loading, baseCtor)

          // 如果设置delay为0 就直接改变lading状态 当前函数会返回loading的构造函数
          if (res.delay === 0) {
            factory.loading = true
          } else {
            setTimeout(() => {
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                forceRender()
              }
            }, res.delay || 200)
          }
        }

        if (isDef(res.timeout)) {
          setTimeout(() => {
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // return in case resolved synchronously

    // 如果是loading状态就返回 loading的组件构造函数
    // 如果已经resolved 就返回 没有就是undefined   如果家在完成resolved在前面会被赋值为异步组件的构造函数
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}

