/* @flow */

import config from '../config'
import { warn } from './debug'
import { inBrowser, inWeex } from './env'

export function handleError (err: Error, vm: any, info: string) {
  if (vm) {
    let cur = vm
    // 当前元素抛出异常 就遍历到根
    while ((cur = cur.$parent)) {
      const hooks = cur.$options.errorCaptured
      // 如果设置了errorCaptured生命周期
      if (hooks) {
        // 循环调用  如果errorCaptured生命周期抛出异常 走全局捕获
        for (let i = 0; i < hooks.length; i++) {
          try {
            const capture = hooks[i].call(cur, err, vm, info) === false
            if (capture) return
          } catch (e) {
            globalHandleError(e, cur, 'errorCaptured hook')
          }
        }
      }
    }
  }
  // 全局捕获方法调用
  globalHandleError(err, vm, info)
}

function globalHandleError (err, vm, info) {
  // 有没有配置全局的错误捕获方法
  if (config.errorHandler) {
    try {
      // 调用一次
      return config.errorHandler.call(null, err, vm, info)
    } catch (e) {
      // 全局的错误捕获方法抛出错误
      logError(e, null, 'config.errorHandler')
    }
  }
  // 打印错误
  logError(err, vm, info)
}

function logError (err, vm, info) {
  // 非生产环境 输出信息
  if (process.env.NODE_ENV !== 'production') {
    warn(`Error in ${info}: "${err.toString()}"`, vm)
  }
  /* istanbul ignore else */
  // 在浏览器或者weex中 有console就输出错误信息
  if ((inBrowser || inWeex) && typeof console !== 'undefined') {
    console.error(err)
  } else {
    throw err
  }
}
