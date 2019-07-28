/* @flow */

// 空对象 不能被改变  const Object.freeze  不能赋值  不能添加属性
export const emptyObject = Object.freeze({})

// these helpers produces better vm code in JS engines due to their
// explicitness and function inlining
// 是否没有值  是否为undefined null
export function isUndef (v: any): boolean %checks {
  return v === undefined || v === null
}

// 是否有值 不为undefined 不为null
export function isDef (v: any): boolean %checks {
  return v !== undefined && v !== null
}

// 是否为真 全等
export function isTrue (v: any): boolean %checks {
  return v === true
}

// 是否为假 全等
export function isFalse (v: any): boolean %checks {
  return v === false
}

/**
 * Check if value is primitive
 */
// 是否是基本数据类型  string number symbol boolean
export function isPrimitive (value: any): boolean %checks {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    // $flow-disable-line
    typeof value === 'symbol' ||
    typeof value === 'boolean'
  )
}

/**
 * Quick object check - this is primarily used to tell
 * Objects from primitive values when we know the value
 * is a JSON-compliant type.
 */
// 是否是个对象 object 并且不为null
export function isObject (obj: mixed): boolean %checks {
  return obj !== null && typeof obj === 'object'
}

/**
 * Get the raw type string of a value e.g. [object Object]
 */
// 获取原型上的toString方法
const _toString = Object.prototype.toString

// 获取数据类型
// 从这个 [object Object] 中截取最后的数据类型
export function toRawType (value: any): string {
  return _toString.call(value).slice(8, -1)
}

/**
 * Strict object type check. Only returns true
 * for plain JavaScript objects.
 */
// 判断是否是一个对象类型
export function isPlainObject (obj: any): boolean {
  return _toString.call(obj) === '[object Object]'
}

// 判断是否是一个正则
export function isRegExp (v: any): boolean {
  return _toString.call(v) === '[object RegExp]'
}

/**
 * Check if val is a valid array index.
 */
// 判断是否是一个正确的数组索引
// 大于等于0 非小数 非NaN  非+-Infinity
export function isValidArrayIndex (val: any): boolean {
  const n = parseFloat(String(val))
  return n >= 0 && Math.floor(n) === n && isFinite(val)
}

/**
 * Convert a value to a string that is actually rendered.
 */
// 把传入值转换成字符串
// 如果是一个对象使用JSON.stringify
// 不是对象就调用String
export function toString (val: any): string {
  return val == null
    ? ''
    : typeof val === 'object'
      ? JSON.stringify(val, null, 2)  // 第三个参数 是为了格式化输出结果  字符串会换行 多加两个空格
      : String(val)
}

/**
 * Convert a input value to a number for persistence.
 * If the conversion fails, return original string.
 */
// 把string转换成number 如果转换后是NaN 还返回的传入的string
export function toNumber (val: string): number | string {
  const n = parseFloat(val)
  return isNaN(n) ? val : n
}

/**
 * Make a map and return a function for checking if a key
 * is in that map.
 */
//
export function makeMap (
  str: string,
  expectsLowerCase?: boolean
): (key: string) => true | void {
  const map = Object.create(null)
  // 把传入的字符串通过逗号分割成数组  见：isBuiltInTag isReservedAttribute
  const list: Array<string> = str.split(',')
  // 把每一项都添加进map中 属性值默认为true
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  // 返回一个函数，
  // map在闭包中键是所有的item值都是true
  // 如果有这个属性值 就返回true
  return expectsLowerCase
    ? val => map[val.toLowerCase()]
    : val => map[val]
}

/**
 * Check if a tag is a built-in tag.
 */
// 检查是否是一个内置标签  把标签名转成小写
export const isBuiltInTag = makeMap('slot,component', true)

/**
 * Check if a attribute is a reserved attribute.
 */
// 检查是否是一个保留属性
export const isReservedAttribute = makeMap('key,ref,slot,slot-scope,is')

/**
 * Remove an item from an array
 */
// 删除数组中的某一项
// splice 改变原有数组
export function remove (arr: Array<any>, item: any): Array<any> | void {
  if (arr.length) {
    // 查找到要删除的这一项
    const index = arr.indexOf(item)
    if (index > -1) {
      // 删除这一项  返回值是被删除的哪一项
      return arr.splice(index, 1)
    }
  }
}

/**
 * Check whether the object has the property.
 */
const hasOwnProperty = Object.prototype.hasOwnProperty
// 把hasOwnProperty包装一下 上下文和键都是通过参数传入 使用call调用
export function hasOwn (obj: Object | Array<*>, key: string): boolean {
  return hasOwnProperty.call(obj, key)
}

/**
 * Create a cached version of a pure function.
 */
// 缓存 用于下面 字符串转换
export function cached<F: Function> (fn: F): F {
  // 通过闭包 把cache对象缓存
  const cache = Object.create(null)
  return (function cachedFn (str: string) {
    // 从缓存中取 如果没有命中 就是undefined
    const hit = cache[str]
    // 有值就返回 没值就调用传入的函数把返回值存入cache然后返回
    return hit || (cache[str] = fn(str))
  }: any)
}

/**
 * Camelize a hyphen-delimited string.
 */
// 把中划线链接的字符串 转驼峰
const camelizeRE = /-(\w)/g
export const camelize = cached((str: string): string => {
  return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : '')
})

/**
 * Capitalize a string.
 */
// 把传入的字符串变成首字母大写
export const capitalize = cached((str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1)
})

/**
 * Hyphenate a camelCase string.
 */
const hyphenateRE = /\B([A-Z])/g
// \B 匹配非单词边界
// 把所有的字母转换成小写
// 如果有大写并且前面不是单词边界 用"-"连起来
// ex: 'AbcDef' => 'abc-def'
export const hyphenate = cached((str: string): string => {
  return str.replace(hyphenateRE, '-$1').toLowerCase()
})

/**
 * Simple bind polyfill for environments that do not support it... e.g.
 * PhantomJS 1.x. Technically we don't need this anymore since native bind is
 * now more performant in most browsers, but removing it would be breaking for
 * code that was able to run in PhantomJS 1.x, so this must be kept for
 * backwards compatibility.
 */

/* istanbul ignore next */
// bind垫片
// 使用call apply包装
function polyfillBind (fn: Function, ctx: Object): Function {
  function boundFn (a) {
    const l = arguments.length
    return l
      ? l > 1
        ? fn.apply(ctx, arguments)
        : fn.call(ctx, a)
      : fn.call(ctx)
  }

  boundFn._length = fn.length
  return boundFn
}

// 原生的bind方法  传入函数 和 上下文  返回bind之后的函数引用
function nativeBind (fn: Function, ctx: Object): Function {
  return fn.bind(ctx)
}

// bind函数如果浏览器不支持原生js的bind 就用垫片制造一个假的返回
export const bind = Function.prototype.bind
  ? nativeBind
  : polyfillBind

/**
 * Convert an Array-like object to a real Array.
 */
// 把一个Array-like 的对象转换成一个数组
// Array-like 有length属性 键都是数字 的对象
export function toArray (list: any, start?: number): Array<any> {
  start = start || 0
  let i = list.length - start
  const ret: Array<any> = new Array(i)
  while (i--) {
    ret[i] = list[i + start]
  }
  return ret
}

/**
 * Mix properties into target object.
 */
// 合并两个对象，会把第二个参数的所有可遍历的属性值 放在第一个参数上
export function extend (to: Object, _from: ?Object): Object {
  for (const key in _from) {
    to[key] = _from[key]
  }
  return to
}

/**
 * Merge an Array of Objects into a single Object.
 */
// 传入一个数组 把数组中每一项的可遍历属性 放在同一个对象中返回
export function toObject (arr: Array<any>): Object {
  const res = {}
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      extend(res, arr[i])
    }
  }
  return res
}

/**
 * Perform no operation.
 * Stubbing args to make Flow happy without leaving useless transpiled code
 * with ...rest (https://flow.org/blog/2017/05/07/Strict-Function-Call-Arity/)
 */
// 空内容函数
export function noop (a?: any, b?: any, c?: any) {}

/**
 * Always return false.
 */
// 永远返回false的函数
export const no = (a?: any, b?: any, c?: any) => false

/**
 * Return same value
 */
// 永远返回和入参一样的函数
export const identity = (_: any) => _

/**
 * Generate a static keys string from compiler modules.
 */
// 遍历数组 把每个元素的staticKeys 链接起来 然后用','拼成字符串
export function genStaticKeys (modules: Array<ModuleOptions>): string {
  // reduce 回调 第一个参数是上次调用的返回值  第二个参数是当前遍历的元素
  // 初始值是[]
  return modules.reduce((keys, m) => {
    return keys.concat(m.staticKeys || [])
  }, []).join(',')
}

/**
 * Check if two values are loosely equal - that is,
 * if they are plain objects, do they have the same shape?
 */
// 比较两个值是否大致相等
export function looseEqual (a: any, b: any): boolean {
  if (a === b) return true
  const isObjectA = isObject(a)
  const isObjectB = isObject(b)
  // 如果相比较的两个参数都是对象
  if (isObjectA && isObjectB) {
    try {
      const isArrayA = Array.isArray(a)
      const isArrayB = Array.isArray(b)
      // 判断两个参数是否是数组
      if (isArrayA && isArrayB) {
        // 比较长度是否相同 递归比较每一项
        return a.length === b.length && a.every((e, i) => {
          return looseEqual(e, b[i])
        })
      } else if (!isArrayA && !isArrayB) {
        // 两个参数都不是数组
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)
        // 键的个数是否相同 然后递归比较每一个值
        // 这就有点假
        return keysA.length === keysB.length && keysA.every(key => {
          return looseEqual(a[key], b[key])
        })
      } else {
        // 如果一个参数是数组一个参数不是数组就直接返回false
        /* istanbul ignore next */
        return false
      }
    } catch (e) {
      /* istanbul ignore next */
      return false
    }
  } else if (!isObjectA && !isObjectB) {
    // 如果两个参数都不是对象 就转换成String比较
    return String(a) === String(b)
  } else {
    // 如果一个参数是对象 一个参数是非对象 直接返回false
    return false
  }
}

// 获取数组的第一个和传入的值大致相等 的索引
export function looseIndexOf (arr: Array<mixed>, val: mixed): number {
  for (let i = 0; i < arr.length; i++) {
    if (looseEqual(arr[i], val)) return i
  }
  return -1
}

/**
 * Ensure a function is called only once.
 */
// 传入一个函数 返回一个函数 保证这个函数只执行一次
export function once (fn: Function): Function {
  let called = false
  return function () {
    if (!called) {
      called = true
      fn.apply(this, arguments)
    }
  }
}
