/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  handleError,
  formatComponentName
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

// 初始化事件
export function initEvents (vm: Component) {
  // 先在vm上挂载一个空对象 _events
  vm._events = Object.create(null)
  // 默认_hasHookEvent为false
  vm._hasHookEvent = false
  // init parent attached events
  // 从父组件传入的 自定义事件
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

// 自定义事件的 add
function add (event, fn, once) {
  if (once) {
    target.$once(event, fn)
  } else {
    target.$on(event, fn)
  }
}

// 自定义事件的remove
function remove (event, fn) {
  target.$off(event, fn)
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {

  // 把当前的vm当做target
  target = vm
  // 绑定事件
  updateListeners(listeners, oldListeners || {}, add, remove, vm)
  target = undefined
}

// 初始化vue的时候被调用 在原型链上加入 $on $once $off $emit
export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/

  // $on 只是一个事件的存储
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    // 如果是个数组 就条用他们的$on相当于 递归到这里
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        this.$on(event[i], fn)
      }
    } else {
      // 把所有的fn 放入 _events中
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  // 保证执行一次
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      // 销毁 然后执行
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    // 调用$on 绑定事件
    vm.$on(event, on)
    return vm
  }

  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    // 如果不传入参数 就销毁所有事件
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    // 如果是个数组 就递归
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        this.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    const cbs = vm._events[event]
    // 传入的事件名不正确 什么都不做
    if (!cbs) {
      return vm
    }

    // 只传入了事件名 没有传入事件函数 就把这个事件名都销毁
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    if (fn) {
      // specific handler
      let cb
      let i = cbs.length
      while (i--) {
        cb = cbs[i]
        // 命中后删除对应的事件
        if (cb === fn || cb.fn === fn) {
          cbs.splice(i, 1)
          break
        }
      }
    }
    return vm
  }

  // $emit是事件的触发
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this

    // 事件名 中有大写的时候 输出提示信息
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }

    // 把事件拿到 然后循环执行
    let cbs = vm._events[event]
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      for (let i = 0, l = cbs.length; i < l; i++) {
        try {
          cbs[i].apply(vm, args)
        } catch (e) {
          // 事件 是由用户定义的  有可能抛出异常这里捕获以下
          handleError(e, vm, `event handler for "${event}"`)
        }
      }
    }
    return vm
  }
}
