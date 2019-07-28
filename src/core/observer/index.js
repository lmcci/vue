/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

// 重新对shouldObserve赋值 以控制observe方法被调用的时候是否执行new Observer
export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that has this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // def是对Object.definedProperty()的封装 默认 writable configurable为true enumerable是第四个参数
    // 把__ob__指向this 设置为不可枚举的
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      // 如果是个数组 就修改所有能对数组本身操作的方法
      const augment = hasProto
        ? protoAugment
        : copyAugment
      augment(value, arrayMethods, arrayKeys)
      // 是个数组调用 observeArray
      this.observeArray(value)
    } else {
      // 非数组调用walk
      this.walk(value)
    }
  }

  /**
   * Walk through each property and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  // 遍历对象中的所有属性（自身所有的可枚举的属性值，不包括原型中的属性） 调用defineReactive
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  // 遍历数组的每一项 调用observe
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment an target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object, keys: any) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment an target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// value就是$options中的data
// asRootData是否是根
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 是一个对象 并且不能是Vnode类型
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  // shouldObserve 在toggleObserving中赋值默认为true 如果被置为false就不执行 new Observer()
  let ob: Observer | void
  // 如果有__ob__属性 并且__ob__是一个Observer对象 就返回ob
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 之前没有设置过shouldObserve为false
    // 不是服务端渲染 是个对象或者数组 可扩展 不是vue实例
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
// 把对象的属性变成响应式的
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  // 如果原来有定义 并且是不可设置的直接返回
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 拿到原油的getter和setter  、
  // 没有定义getter 或者 定义了 setter   如果只传入两个参数  val只有两个参数的时候是没有值的
  // 从对象中取得值 赋值给val
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 没有指定浅层遍历  调用observe() 递归执行每一个属性变成响应式对象
  // 属性如果是响应式的 就会返回child的__ob__
  // 如果val不是一个对象 就会直接返回 childOb为undefined
  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // 每当数据被访问到getter的时候 就把当前watcher作为订阅者放在dep.subs中
    get: function reactiveGetter () {
      // 如果以前有设置getter就调用 把值赋给value
      const value = getter ? getter.call(obj) : val

      // 依赖收集
      // 在render中调用data的getter 会走到这里
      if (Dep.target) {
        // 调用depend() 会调用wather的addDep 然后保存depid 然后再调用dep的addSub
        // 把当前watcher作为这个数据的订阅
        dep.depend()
        if (childOb) {
          // 如果对象中某个属性也是响应式的 就调用这个属性的depend() 收集依赖
          childOb.dep.depend()
          // 如果属性是一个数组
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 如果定义了getter就调用一次 获得旧值
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 如果新值和以前的相同 就返回
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      // 非生产环境下 如果定义了customSetter就调用一次
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // 如果以前定义的有setter就调用一次
      if (setter) {
        setter.call(obj, newVal)
      } else {
        // 没有定义setter 就赋值给val
        val = newVal
      }
      // 没有指定浅层遍历 就调用observe
      childOb = !shallow && observe(newVal)
      // 派发更新
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// Vue.set  vm.$set
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 如果要对 undefined 或者 基本数据类型的值 添加响应的key 就报警告
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 数组 判断是否是正确索引
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 是改变还是添加
    target.length = Math.max(target.length, key)
    // 调用vue定义的数组splice方法
    target.splice(key, 1, val)
    return val
  }
  // 对象如果已经存在了这个key可以触发响应  就直接赋值
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  // __ob__ 就是Observer实例
  const ob = (target: any).__ob__
  // 如果是一个vue实例 或者 是rootData（vmCount不为0） 生产环境报警告
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 如果target不是响应式的 就什么直接赋值 什么都不做
  if (!ob) {
    target[key] = val
    return val
  }
  // 把当前的key变成响应式的
  defineReactive(ob.value, key, val)
  // 调用一次派发更新
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  // 要对一个undefined或者基本数据类型 做删除操作就报警告
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 如果是对一个数组做删除操作 判断key是否是一个正确的索引
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 调用被覆盖过的数组方法 删除
    target.splice(key, 1)
    return
  }
  // 拿到Observer实例
  const ob = (target: any).__ob__
  // 是vue实例 或者是根data 非生产环境下报警告
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  // 如果本身没有这个属性 就没有必要删除
  if (!hasOwn(target, key)) {
    return
  }
  // 通过delete运算符删除这个key
  delete target[key]
  // 如果不是响应式的数据 就什么都不做
  if (!ob) {
    return
  }
  // 调用notify执行update 更新一次
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  // 遍历数组中的每一个值
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    // 如果有__ob__属性证明已经是一个响应式的了
    // __ob__ 就是Observer的实例   Observer在初始化的时候已经创建了dep属性
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
