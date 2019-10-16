/* @flow */

import RenderStream from './render-stream'
import { createWriteFunction } from './write'
import { createRenderFunction } from './render'
import { createPromiseCallback } from './util'
import TemplateRenderer from './template-renderer/index'
import type { ClientManifest } from './template-renderer/index'

// 定义一些类型
export type Renderer = {
  renderToString: (component: Component, context: any, cb: any) => ?Promise<string>;
  renderToStream: (component: Component, context?: Object) => stream$Readable;
};

type RenderCache = {
  get: (key: string, cb?: Function) => string | void;
  set: (key: string, val: string) => void;
  has?: (key: string, cb?: Function) => boolean | void;
};

export type RenderOptions = {
  modules?: Array<(vnode: VNode) => ?string>;
  directives?: Object;
  isUnaryTag?: Function;
  cache?: RenderCache;
  template?: string;
  inject?: boolean;
  basedir?: string;
  shouldPreload?: Function;
  shouldPrefetch?: Function;
  clientManifest?: ClientManifest;
  runInNewContext?: boolean | 'once';
};

export function createRenderer ({
  modules = [],
  directives = {},
  isUnaryTag = (() => false),
  template,
  inject,
  cache,
  shouldPreload,
  shouldPrefetch,
  clientManifest
}: RenderOptions = {}): Renderer {
  // 创建一个render函数
  const render = createRenderFunction(modules, directives, isUnaryTag, cache)
  // 模板渲染函数
  const templateRenderer = new TemplateRenderer({
    template,
    inject,
    shouldPreload,
    shouldPrefetch,
    clientManifest
  })

  // 返回一个对象 有renderToStream 和 renderToString 两个函数
  return {
    renderToString (
      component: Component,
      context: any,
      cb: any
    ): ?Promise<string> {
      // 序列化参数列表 交换位置
      if (typeof context === 'function') {
        cb = context
        context = {}
      }
      // 模板渲染
      if (context) {
        templateRenderer.bindRenderFns(context)
      }

      // no callback, return Promise
      // 没有传入回调 证明想用promise方式
      let promise
      if (!cb) {
        ({ promise, cb } = createPromiseCallback())
      }

      // 创建一个write
      let result = ''
      const write = createWriteFunction(text => {
        result += text
        return false
      }, cb)
      try {
        render(component, write, context, err => {
          // 调用模板的render
          if (template) {
            result = templateRenderer.renderSync(result, context)
          }
          // 渲染有异常就调用回调传入异常
          // 没有异常就传入结果
          if (err) {
            cb(err)
          } else {
            cb(null, result)
          }
        })
      } catch (e) {
        cb(e)
      }

      return promise
    },

    renderToStream (
      component: Component,
      context?: Object
    ): stream$Readable {
      // 模板渲染
      if (context) {
        templateRenderer.bindRenderFns(context)
      }
      // 流渲染对象
      const renderStream = new RenderStream((write, done) => {
        render(component, write, context, done)
      })
      // 没有模板直接返回流对象
      if (!template) {
        return renderStream
      } else {
        // 有模板
        const templateStream = templateRenderer.createStream(context)
        renderStream.on('error', err => {
          templateStream.emit('error', err)
        })
        renderStream.pipe(templateStream)
        return templateStream
      }
    }
  }
}
