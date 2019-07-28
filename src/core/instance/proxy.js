/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

let initProxy

if (process.env.NODE_ENV !== 'production') {
  // 返回一个函数 传入参数是否在下面
  // 允许全局
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,' +
    'require' // for Webpack/Browserify
  )

  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  // 判断浏览器是否支撑Proxy 必须是原生方法不是垫片
  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  if (hasProxy) {
    // 是否是内置的修饰符
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')
    // 全局定义的keyCodes 也是一个对象 键值对 是自定义的修饰符 和按键键码
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        // 用代理的方式 就是为了检测有没有和内置的修饰符 重名
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  // 检测是否存在
  const hasHandler = {
    has (target, key) {
      // 是否在target上有这个key   无论该属性存在于实例中还是原型中
      const has = key in target
      // 是否允许
      // 是全局属性 或者 key以下划线开头
      const isAllowed = allowedGlobals(key) || (typeof key === 'string' && key.charAt(0) === '_')
      if (!has && !isAllowed) {
        // 没有在target上存在  并且 不是全局属性 并且不是以_开头 就显示警告
        warnNonPresent(target, key)
      }
      return has || !isAllowed
    }
  }

  // 获取时
  const getHandler = {
    get (target, key) {
      // key是string 在target上没有的时候就报警告
      if (typeof key === 'string' && !(key in target)) {
        warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  initProxy = function initProxy (vm) {
    // 浏览器是否支持proxy
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler
      // 判断是否有这个属性 没有输出警告
      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      vm._renderProxy = vm
    }
  }
}

export { initProxy }
