/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};
// 返回prop的值
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  // 从$options.props拿到当前要访问的prop
  const prop = propOptions[key]
  // 判断propsData有没有当前的key  如果没有absent为true
  const absent = !hasOwn(propsData, key)
  // 从propsData中取得当前要访问的值
  let value = propsData[key]
  // boolean casting
  // 获取boolean的索引
  const booleanIndex = getTypeIndex(Boolean, prop.type)
  // 如果存在prop.type中有boolean
  if (booleanIndex > -1) {
    // propsData中也设置了这个key 并且 props中这个key没有设置default
    if (absent && !hasOwn(prop, 'default')) {
      value = false
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 获取string在prop.type中的索引
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  // check default value
  // 如果prop还没有赋值就获取默认prop
  if (value === undefined) {
    // 获取默认的prop
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.

    // 先把shouldObserve值为true
    // 把当前遍历到的的value变成响应式的
    // 再还原shouldObserve
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }

  // 非生产环境中 非weex中 校验prop
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
// 获取prop的默认值
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  // 如果prop没有设置default属性或者方法 就返回undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }
  // 获取default
  const def = prop.default
  // warn against non-factory defaults for Object & Array
  // 非生产环境 default是一个对象 就警告  必须是一个方法 返回值是prop默认值
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  // propsData有值 并且propsData中没有当前访问的key的值 _props有这个值就返回
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  // 如果default是一个方法就调用一次传入vm当做上下文  否则就直接返回default 因为上面的校验值有一个警告
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid.
 */
// 校验prop
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 如果prop是必须的 并且没有这个prop就警告
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  // 如果prop值为null 非必须的  直接返回 不用校验了
  if (value == null && !prop.required) {
    return
  }
  // prop指定的type
  let type = prop.type
  // 没有指定type就是校验通过 还没遇到过type为true的时候
  let valid = !type || type === true
  // 期望的类型
  const expectedTypes = []
  // 如果prop指定了类型
  if (type) {
    // 不是一个数组 就构造一个只有一个元素的数组
    if (!Array.isArray(type)) {
      type = [type]
    }
    // 遍历到有一个校验通过的prop
    for (let i = 0; i < type.length && !valid; i++) {
      // 调用assertType 返回是否校验通过和期望类型
      const assertedType = assertType(value, type[i])
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }
  // 如果校验没有通过 就警告
  if (!valid) {
    warn(
      `Invalid prop: type check failed for prop "${name}".` +
      ` Expected ${expectedTypes.map(capitalize).join(', ')}` +
      `, got ${toRawType(value)}.`,
      vm
    )
    return
  }
  // prop如果有传入validator校验 就调用一次 如果返回false就警告
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

// 校验类型   返回是否校验通过 和 期望的类型
function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  // 获取期望类型
  const expectedType = getType(type)
  // 简单数据类型
  if (simpleCheckRE.test(expectedType)) {
    // 获取value的类型
    const t = typeof value
    // 判断value  type 类型是否相同
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    // 不相同 并且value是一个对象
    if (!valid && t === 'object') {
      // 判断是不是type的实例
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    // 期望类型是Object
    // 判断value是否是一个非null 对象
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    // 判断是否是一个数组
    valid = Array.isArray(value)
  } else {
    // 判断是否是type的实例
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
// 获取function的名称字符串
// 根据翻译：用简单的相等判断会在 iframe 中失效 所以要这么获取然后给isSameType用
function getType (fn) {
  // 转换成string 截取名称
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  // 截取到就返回 否则返回空字符串
  return match ? match[1] : ''
}

// 判断两个方法是否相同 （只判断名称）
function isSameType (a, b) {
  return getType(a) === getType(b)
}

// 获取类型在期望类型的索引
// 类型 和 期望的类型
function getTypeIndex (type, expectedTypes): number {
  // 期望类型不是一个数组
  if (!Array.isArray(expectedTypes)) {
    // 调用isSameType 判断方法名 相同返回0 不同返回-1  因为是获取索引  getXXXIndex
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  // 期望类型是个数组 就遍历  第一个匹配的时候 返回索引
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}
