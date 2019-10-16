/* @flow */

/**
 * Original RenderStream implementation by Sasha Aickin (@aickin)
 * Licensed under the Apache License, Version 2.0
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Modified by Evan You (@yyx990803)
 */

const stream = require('stream')

import { isTrue, isUndef } from 'shared/util'
import { createWriteFunction } from './write'

// 定义类 继承 node中的 stream.Readable
export default class RenderStream extends stream.Readable {
  buffer: string;
  render: (write: Function, done: Function) => void;
  expectedSize: number;
  write: Function;
  next: Function;
  end: Function;
  done: boolean;

  // 创建对象的时候 传入一个render函数
  constructor (render: Function) {
    super()

    // 初始化变量
    this.buffer = ''
    this.render = render
    this.expectedSize = 0

    // 重写write函数    createWriteFunction返回一个函数
    this.write = createWriteFunction((text, next) => {
      // 真正执行write函数是走这里  调用this.write的时候 也会传入这两个参数
      // 预期的大小
      const n = this.expectedSize
      // 往缓存中拼接text
      this.buffer += text

      // 拼接之后如果大于预期的大小
      if (this.buffer.length >= n) {
        //
        this.next = next
        this.pushBySize(n)
        return true // we will decide when to call next
      }
      // 返回false下一个tick会执行next
      return false
    }, err => {
      // 错误的回调
      this.emit('error', err)
    })

    // 重写  渲染结束的函数
    this.end = () => {
      // the rendering is finished; we should push out the last of the buffer.
      // 设置标记
      this.done = true
      // 把剩余的buffer全部push
      this.push(this.buffer)
    }
  }

  // 从buffer中截取一段push  剩余的继续留在buffer中
  pushBySize (n: number) {
    // 截取buffer
    const bufferToPush = this.buffer.substring(0, n)
    this.buffer = this.buffer.substring(n)
    this.push(bufferToPush)
  }

  // 尝试渲染？
  tryRender () {
    // 有可能抛出异常 所以才叫尝试？
    try {
      // 调用函数 传入回调
      this.render(this.write, this.end)
    } catch (e) {
      this.emit('error', e)
    }
  }

  // 执行next  有可能抛出异常
  tryNext () {
    try {
      this.next()
    } catch (e) {
      this.emit('error', e)
    }
  }

  //
  _read (n: number) {
    this.expectedSize = n
    // it's possible that the last chunk added bumped the buffer up to > 2 * n,
    // which means we will need to go through multiple read calls to drain it
    // down to < n.
    // 查看标记是否已经完成
    if (isTrue(this.done)) {
      this.push(null)
      return
    }
    // 如果buffer的长度大于期望的长度 就先push期望的长度 剩余的下次再说
    if (this.buffer.length >= n) {
      this.pushBySize(n)
      return
    }
    //
    if (isUndef(this.next)) {
      // start the rendering chain.
      this.tryRender()
    } else {
      // continue with the rendering.
      this.tryNext()
    }
  }
}
