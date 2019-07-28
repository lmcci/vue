/* @flow */

// can we use __proto__?
// 浏览器是否支撑 原型 __proto__
// 实例对象__proto__指向构造函数的原型
export const hasProto = '__proto__' in {}

// Browser environment sniffing
// 是否在浏览器环境中
export const inBrowser = typeof window !== 'undefined'
// 是否在weex中
export const inWeex = typeof WXEnvironment !== 'undefined' && !!WXEnvironment.platform
// weex的平台
export const weexPlatform = inWeex && WXEnvironment.platform.toLowerCase()
// 浏览器的ua
export const UA = inBrowser && window.navigator.userAgent.toLowerCase()
// 通过ua判断是否是IE
export const isIE = UA && /msie|trident/.test(UA)
// 通过ua判断是否是IE9
export const isIE9 = UA && UA.indexOf('msie 9.0') > 0
// 通过ua判断是否是Edge
export const isEdge = UA && UA.indexOf('edge/') > 0
// 通过ua判断是否是android
export const isAndroid = (UA && UA.indexOf('android') > 0) || (weexPlatform === 'android')
// 通过ua判断是否是ios
export const isIOS = (UA && /iphone|ipad|ipod|ios/.test(UA)) || (weexPlatform === 'ios')
// 通过ua判断是否是chrome
export const isChrome = UA && /chrome\/\d+/.test(UA) && !isEdge

// Firefox has a "watch" function on Object.prototype...
// 翻译：火狐在Object.prototype有watch方法
export const nativeWatch = ({}).watch

// 是否支持passive 修饰符
// addEventListener第三个参数  { capture: false, passive: false, once: false}
// passive true 阻止事件默认行为
export let supportsPassive = false
if (inBrowser) {
  try {
    const opts = {}
    Object.defineProperty(opts, 'passive', ({
      get () {
        /* istanbul ignore next */
        supportsPassive = true
      }
    }: Object)) // https://github.com/facebook/flow/issues/285
    window.addEventListener('test-passive', null, opts)
  } catch (e) {}
}

// this needs to be lazy-evaled because vue may be required before
// vue-server-renderer can set VUE_ENV
// 是否是服务端渲染
let _isServer  // 这个变量相当于缓存
export const isServerRendering = () => {

  // 如果还没有赋值就执行一次 下次要么是true 要么是false
  if (_isServer === undefined) {
    /* istanbul ignore if */
    // 非浏览器  非weex  有global变量  八成就是服务端运行
    if (!inBrowser && !inWeex && typeof global !== 'undefined') {
      // detect presence of vue-server-renderer and avoid
      // Webpack shimming the process
      // 判断全局变量最终确认
      _isServer = global['process'].env.VUE_ENV === 'server'
    } else {
      _isServer = false
    }
  }
  return _isServer
}

// detect devtools
// 浏览器环境 并且在window上有__VUE_DEVTOOLS_GLOBAL_HOOK__
export const devtools = inBrowser && window.__VUE_DEVTOOLS_GLOBAL_HOOK__

/* istanbul ignore next */
// 判断是否是原生方法 垫片实现的返回false
export function isNative (Ctor: any): boolean {
  // 浏览器原生实现的方法体是 native code
  // function Proxy() { [native code] }
  return typeof Ctor === 'function' && /native code/.test(Ctor.toString())
}

// 是否支持原生Symbol
export const hasSymbol =
  typeof Symbol !== 'undefined' && isNative(Symbol) &&
  typeof Reflect !== 'undefined' && isNative(Reflect.ownKeys)

let _Set
/* istanbul ignore if */ // $flow-disable-line
// 浏览器原生是否支撑 Set
if (typeof Set !== 'undefined' && isNative(Set)) {
  // use native Set when available.
  _Set = Set
} else {
  // a non-standard Set polyfill that only works with primitive keys.
  // 浏览器不支持Set 就自己模仿Set构造一个
  _Set = class Set implements SimpleSet {
    set: Object;
    constructor () {
      // 内部使用Object来实现
      this.set = Object.create(null)
    }
    has (key: string | number) {
      return this.set[key] === true
    }
    add (key: string | number) {
      this.set[key] = true
    }
    clear () {
      this.set = Object.create(null)
    }
  }
}

interface SimpleSet {
  has(key: string | number): boolean;
  add(key: string | number): mixed;
  clear(): void;
}

export { _Set }
export type { SimpleSet }
