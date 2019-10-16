/* @flow */

import { createWriteFunction } from './write'
import { createRenderFunction } from './render'
import type { RenderOptions } from './create-renderer'

export function createBasicRenderer ({
  modules = [],
  directives = {},
  isUnaryTag = (() => false),
  cache
}: RenderOptions = {}) {
  // 创建一个render函数
  const render = createRenderFunction(modules, directives, isUnaryTag, cache)

  // 返回一个函数
  return function renderToString (
    component: Component,
    context: any,
    done: any
  ): void {
    // 交换参数位置
    if (typeof context === 'function') {
      done = context
      context = {}
    }
    // 创建一个write函数
    let result = ''
    const write = createWriteFunction(text => {
      result += text
      return false
    }, done)
    try {
      // 调用render 完成的时候执行回调
      render(component, write, context, () => {
        done(null, result)
      })
    } catch (e) {
      done(e)
    }
  }
}
