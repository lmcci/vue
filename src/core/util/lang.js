/* @flow */

/**
 * Check if a string starts with $ or _
 */
// 判断string字符串是否以 $ _开头
// $ _开头是内置保留的
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
 * Define a property.
 */
// 对defineProperty的一层包装
// 目标对象  键   指   当前键是否可枚举
// 默认可改变配置 可重写
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
 */
const bailRE = /[^\w.$]/
// 作用就是传入 path 'a.b.c'  返回一个函数 fn
// fn调用是传入对象obj  可以获得到obj.a.b.c
export function parsePath (path: string): any {
  if (bailRE.test(path)) {
    return
  }
  // 根据.分割字符串
  const segments = path.split('.')
  return function (obj) {
    // 从头到尾遍历属性层级
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      // 拿到一级属性值 赋值给obj 然后继续向下找
      obj = obj[segments[i]]
    }
    return obj
  }
}
