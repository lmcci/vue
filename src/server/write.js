/* @flow */

const MAX_STACK_DEPTH = 1000
const noop = _ => _

// 下一个tick会执行 根据环境判断支持哪种方式，不断降级
const defer = typeof process !== 'undefined' && process.nextTick
  ? process.nextTick
  : typeof Promise !== 'undefined'
    ? fn => Promise.resolve().then(fn)
    : typeof setTimeout !== 'undefined'
      ? setTimeout
      : noop

// 降级之后还没有能用的方法  就直接报错
if (defer === noop) {
  throw new Error(
    'Your JavaScript runtime does not support any asynchronous primitives ' +
    'that are required by vue-server-renderer. Please use a polyfill for ' +
    'either Promise or setTimeout.'
  )
}

export function createWriteFunction (
  write: (text: string, next: Function) => boolean,
  onError: Function
): Function {
  // 变量记录栈内由几个
  let stackDepth = 0
  const cachedWrite = (text, next) => {
    // 传入了text 并且缓存标记caching为true 就先放在缓存中 （字符串拼接在最后一位）
    if (text && cachedWrite.caching) {
      cachedWrite.cacheBuffer[cachedWrite.cacheBuffer.length - 1] += text
    }
    // write 是创建的时候传入的 这里调用一次 把cachedWrite的参数传入
    const waitForNext = write(text, next)
    // 返回一个标记 是否等待下一次写入
    if (waitForNext !== true) {
      // 不等待
      // 是否达到栈的最大容量
      if (stackDepth >= MAX_STACK_DEPTH) {
        // 下一个tick的时候 执行回调。如果报错就走错误的回调
        defer(() => {
          try { next() } catch (e) {
            onError(e)
          }
        })
      } else {
        // 先改标记  有可能递归
        stackDepth++
        // 调用回调
        next()
        // 改回标记
        stackDepth--
      }
    }
  }
  // 函数下添加静态变量
  cachedWrite.caching = false
  cachedWrite.cacheBuffer = []
  cachedWrite.componentBuffer = []
  return cachedWrite
}
