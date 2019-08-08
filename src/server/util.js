/* @flow */

// 通过文件名判断是不是js文件
export const isJS = (file: string): boolean => /\.js(\?[^.]+)?$/.test(file)

// 通过文件名判断是不是css文件
export const isCSS = (file: string): boolean => /\.css(\?[^.]+)?$/.test(file)

// 返回一个对象有promise和cb 当cb被调用的时候 会执行promise的reject或者resolve
export function createPromiseCallback () {
  let resolve, reject
  const promise: Promise<string> = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  const cb = (err: Error, res?: string) => {
    if (err) return reject(err)
    resolve(res || '')
  }
  return { promise, cb }
}
