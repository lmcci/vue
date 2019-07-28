/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  computed: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  dep: Dep;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean // 是否是渲染watcher
  ) {
    this.vm = vm
    // 如果是渲染watcher
    if (isRenderWatcher) {
      // 就把当前的渲染watcher实例赋值给vm._watcher
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.computed = !!options.computed
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.computed = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.computed // for computed watchers  如果是计算属性的watcher就为true
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    // 这个就是为了 打错误信息用的 把传入的函数转成字符串
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      // 渲染watcher的case  expOrFn是updateComponent  赋值给getter
      this.getter = expOrFn
    } else {
      // expOrFn 是一个字符串表达式 a.b.c 调用parsePath返回一个函数  这个函数调用的时候传入一个对象会返回 对象.a.b.c属性
      this.getter = parsePath(expOrFn)
      // 如果没有生成getter就赋值一个空函数 非生产环境报警告
      if (!this.getter) {
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    if (this.computed) {
      // 计算属性的watcher 要自己创建一个dep
      // 不会立刻调用get()求值
      this.value = undefined
      this.dep = new Dep()
    } else {
      // 初始化的时候调用一次get
      this.value = this.get()
    }
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 调用get()的时候把当前watcher调用pushTarget 然后使得Dep.target就是当前watcher
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 调用getter初始化传入的第二个参数
      // 用户watcher的时候调用getter 然后依赖收集  然后订阅这个user watcher
      // 渲染watcher case  相当于调用updateComponent上下文是vm 第一个参数是vm
      // 上面先pushTarget(this)改变了当前的watcher然后执行this.getter.call(vm, vm) 就是要搜集依赖的时候都把当前watcher作为订阅者
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 如果指定了deep为true 就调用traverse深度递归每个属性 从而触发getter收集依赖
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      // 清除依赖 如果新的一轮没有订阅者就删除watcher 把newDeps放到deps中 清除newDeps
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 如果没有就添加
    // newDepIds
    // depIds
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 把当前watcher订阅上
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 清除依赖收集
  cleanupDeps () {
    // 遍历deps 如果newDepIds中没有就删除当前watcher
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 把depIds和newDepIds交换 然后把newDepIds清除
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()

    // 把deps和newDeps交换 然后把newDeps清除
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 当订阅数据发生变化会被调用
  update () {
    /* istanbul ignore else */
    if (this.computed) {
      // 计算属性的时候
      // A computed property watcher has two modes: lazy and activated.
      // It initializes as lazy by default, and only becomes activated when
      // it is depended on by at least one subscriber, which is typically
      // another computed property or a component's render function.
      // 没有订阅者的时候什么都不做
      if (this.dep.subs.length === 0) {
        // In lazy mode, we don't want to perform computations until necessary,
        // so we simply mark the watcher as dirty. The actual computation is
        // performed just-in-time in this.evaluate() when the computed property
        // is accessed.
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        // 调用一次get然后比较新值和旧值是否相等  不等的话就调用 dep.notify() 触发渲染watcher重新渲染
        this.getAndInvoke(() => {
          this.dep.notify()
        })
      }
    } else if (this.sync) {
      // 如果指定了sync 就立即调用run 否则走下面else
      this.run()
    } else {
      // 非同步 非计算属性的时候 更新走这里 下一个tick的时候执行run
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    // 先判断标记位  除非已经调用过teardown 否则一直都是true
    if (this.active) {
      this.getAndInvoke(this.cb)
    }
  }

  getAndInvoke (cb: Function) {
    // 调用get获得新值
    const value = this.get()
    // 如果新旧值不一样， 或者新值是一个对象  或者是一个deepWathcer
    if (
      value !== this.value ||
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep
    ) {
      // set new value
      // 缓存一次旧值
      const oldValue = this.value
      // 赋值新值
      this.value = value
      this.dirty = false
      if (this.user) {
        // userwatcher的时候执行回调 使用try catch包裹
        try {
          cb.call(this.vm, value, oldValue)
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        // 非userwathcer就直接执行回调
        cb.call(this.vm, value, oldValue)
      }
    }
  }

  /**
   * Evaluate and return the value of the watcher.
   * This only gets called for computed property watchers.
   */
  // 计算属性的getter被调用的时候 才会走到这里
  evaluate () {
    // 第一次dirty是为true  当依赖发生变化的时候也会为true
    if (this.dirty) {
      // 求值一次
      this.value = this.get()
      // 置为false
      this.dirty = false
    }
    return this.value
  }

  /**
   * Depend on this watcher. Only for computed property watchers.
   */
  // 计算属性的watcher才会调用
  depend () {
    if (this.dep && Dep.target) {
      // 依赖收集
      this.dep.depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    // 先判断这个激活的标记位
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 把当前watcher 从vm中的_watchers删除
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      // 遍历deps删除当前watcher
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      // 设置标记
      this.active = false
    }
  }
}
