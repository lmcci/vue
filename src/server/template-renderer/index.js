/* @flow */

const path = require('path')
const serialize = require('serialize-javascript')

import { isJS, isCSS } from '../util'
import TemplateStream from './template-stream'
import { parseTemplate } from './parse-template'
import { createMapper } from './create-async-file-mapper'
import type { ParsedTemplate } from './parse-template'
import type { AsyncFileMapper } from './create-async-file-mapper'

type TemplateRendererOptions = {
  template: ?string;
  inject?: boolean;
  clientManifest?: ClientManifest;
  shouldPreload?: (file: string, type: string) => boolean;
  shouldPrefetch?: (file: string, type: string) => boolean;
};

export type ClientManifest = {
  publicPath: string;
  all: Array<string>;
  initial: Array<string>;
  async: Array<string>;
  modules: {
    [id: string]: Array<number>;
  },
  hasNoCssVersion?: {
    [file: string]: boolean;
  }
};

type Resource = {
  file: string;
  extension: string;
  fileWithoutQuery: string;
  asType: string;
};

export default class TemplateRenderer {
  options: TemplateRendererOptions;
  inject: boolean;
  parsedTemplate: ParsedTemplate | null;
  publicPath: string;
  clientManifest: ClientManifest;
  preloadFiles: Array<Resource>;
  prefetchFiles: Array<Resource>;
  mapFiles: AsyncFileMapper;

  constructor (options: TemplateRendererOptions) {
    this.options = options
    this.inject = options.inject !== false
    // if no template option is provided, the renderer is created
    // as a utility object for rendering assets like preload links and scripts.
    // 模板转换 最终获取到的是三块替换完成的字符串
    this.parsedTemplate = options.template
      ? parseTemplate(options.template)
      : null

    // extra functionality with client manifest
    // clientManifest中取得字符
    if (options.clientManifest) {
      const clientManifest = this.clientManifest = options.clientManifest
      this.publicPath = clientManifest.publicPath.replace(/\/$/, '')
      // preload/prefetch directives
      // 序列化文件路径 返回相关的信息 类型 后缀 去除？后的路径
      this.preloadFiles = (clientManifest.initial || []).map(normalizeFile)
      this.prefetchFiles = (clientManifest.async || []).map(normalizeFile)
      // initial async chunk mapping
      // 一个函数 调用传入id返回文件列表
      this.mapFiles = createMapper(clientManifest)
    }
  }

  // 改变this指向
  bindRenderFns (context: Object) {
    const renderer: any = this;
    // 遍历着改
    ['ResourceHints', 'State', 'Scripts', 'Styles'].forEach(type => {
      context[`render${type}`] = renderer[`render${type}`].bind(renderer, context)
    })
    // also expose getPreloadFiles, useful for HTTP/2 push
    // 挑着改
    context.getPreloadFiles = renderer.getPreloadFiles.bind(renderer, context)
  }

  // render synchronously given rendered app content and render context
  renderSync (content: string, context: ?Object) {
    const template = this.parsedTemplate
    // 构造函数中没有生成模板 就直接报错
    if (!template) {
      throw new Error('renderSync cannot be called without a template.')
    }
    context = context || {}
    // 是否要注入
    if (this.inject) {
      return (
        // 开始到header结束
        template.head(context) +
        //  上下文head
        (context.head || '') +
        //  资源链接
        this.renderResourceHints(context) +
        //  渲染样式
        this.renderStyles(context) +
        //  head结束到标记开始
        template.neck(context) +
        //  渲染内容
        content +
        //  vuex状态
        this.renderState(context) +
        //  渲染脚本
        this.renderScripts(context) +
        //  从标记结束到最后
        template.tail(context)
      )
    } else {
      return (
        // 拼接内容 返回
        template.head(context) +
        template.neck(context) +
        content +
        template.tail(context)
      )
    }
  }

  // 渲染样式
  renderStyles (context: Object): string {
    // 清单文件 过滤css
    const cssFiles = this.clientManifest
      ? this.clientManifest.all.filter(isCSS)
      : []
    return (
      // render links for css files
      // 拼接外链css
      (cssFiles.length
        ? cssFiles.map(file => `<link rel="stylesheet" href="${this.publicPath}/${file}">`).join('')
        : '') +
      // context.styles is a getter exposed by vue-style-loader which contains
      // the inline component styles collected during SSR
      // 拼接styles标签及内容
      (context.styles || '')
    )
  }

  // 拼接link rel="preload"  和   link rel="prefetch"
  renderResourceHints (context: Object): string {
    return this.renderPreloadLinks(context) + this.renderPrefetchLinks(context)
  }

  // preloadFiles 拼接上 异步文件
  getPreloadFiles (context: Object): Array<Resource> {
    const usedAsyncFiles = this.getUsedAsyncFiles(context)
    if (this.preloadFiles || usedAsyncFiles) {
      return (this.preloadFiles || []).concat(usedAsyncFiles || [])
    } else {
      return []
    }
  }

  // link rel="preload"
  renderPreloadLinks (context: Object): string {
    // 需要preload 的文件
    const files = this.getPreloadFiles(context)
    // 配置的shouldPreload回调
    const shouldPreload = this.options.shouldPreload
    // 判断是否为空数组
    if (files.length) {
      // 遍历文件 拼接
      return files.map(({ file, extension, fileWithoutQuery, asType }) => {
        let extra = ''
        // by default, we only preload scripts or css
        // 不是script 不是style 没有配置shouldPreload回调
        if (!shouldPreload && asType !== 'script' && asType !== 'style') {
          return ''
        }
        // user wants to explicitly control what to preload
        // 配置了shouldPreload回调  传入文件名 返回值为false的
        if (shouldPreload && !shouldPreload(fileWithoutQuery, asType)) {
          return ''
        }
        // 字体文件
        if (asType === 'font') {
          extra = ` type="font/${extension}" crossorigin`
        }
        // 拼接好 字符串返回
        return `<link rel="preload" href="${
          this.publicPath}/${file
        }"${
          asType !== '' ? ` as="${asType}"` : ''
        }${
          extra
        }>`
      }).join('')
    } else {
      return ''
    }
  }

  // link rel="prefetch"
  renderPrefetchLinks (context: Object): string {
    // 配置shouldPrefetch 回调
    const shouldPrefetch = this.options.shouldPrefetch
    // 有传入的async配置   文件
    if (this.prefetchFiles) {
      const usedAsyncFiles = this.getUsedAsyncFiles(context)
      // 判断当前文件是否已经执行过
      const alreadyRendered = file => {
        // usedAsyncFiles中是否存在
        return usedAsyncFiles && usedAsyncFiles.some(f => f.file === file)
      }
      return this.prefetchFiles.map(({ file, fileWithoutQuery, asType }) => {
        // 配置了shouldPrefetch  传入文件 并且返回false
        if (shouldPrefetch && !shouldPrefetch(fileWithoutQuery, asType)) {
          return ''
        }
        // 已经执行过了
        if (alreadyRendered(file)) {
          return ''
        }
        // 拼接字符串 返回
        return `<link rel="prefetch" href="${this.publicPath}/${file}">`
      }).join('')
    } else {
      return ''
    }
  }

  // vuex 数据
  renderState (context: Object, options?: Object): string {
    const {
      contextKey = 'state',
      windowKey = '__INITIAL_STATE__'
    } = options || {}
    const state = serialize(context[contextKey], { isJSON: true })
    // 最后执行的 还要删除当前的脚本
    const autoRemove = process.env.NODE_ENV === 'production'
      ? ';(function(){var s;(s=document.currentScript||document.scripts[document.scripts.length-1]).parentNode.removeChild(s);}());'
      : ''
    return context[contextKey]
      // 拼接字符串 往window下添加__INITIAL_STATE__  内容为state   然后再把当前脚本删除
      ? `<script>window.${windowKey}=${state}${autoRemove}</script>`
      : ''
  }

  // js脚本
  renderScripts (context: Object): string {
    // 有没得清单文件
    if (this.clientManifest) {
      // 传入的initial
      const initial = this.preloadFiles
      const async = this.getUsedAsyncFiles(context)
      // 为何要这样拼接？
      const needed = [initial[0]].concat(async || [], initial.slice(1))
      // 过滤掉非js的文件   再拼接script  设置有defer属性
      return needed.filter(({ file }) => isJS(file)).map(({ file }) => {
        return `<script src="${this.publicPath}/${file}" defer></script>`
      }).join('')
    } else {
      return ''
    }
  }

  // 已经执行过的异步文件
  getUsedAsyncFiles (context: Object): ?Array<Resource> {
    if (!context._mappedFiles && context._registeredComponents && this.mapFiles) {
      const registered = Array.from(context._registeredComponents)
      context._mappedFiles = this.mapFiles(registered).map(normalizeFile)
    }
    return context._mappedFiles
  }

  // create a transform stream
  // 创建一个stream
  createStream (context: ?Object): TemplateStream {
    // 如果没有转换后的三段模板 对象
    if (!this.parsedTemplate) {
      throw new Error('createStream cannot be called without a template.')
    }
    return new TemplateStream(this, this.parsedTemplate, context || {})
  }
}

// 序列化路径
function normalizeFile (file: string): Resource {
  // 调换路径 ?a=1&b=2 为空 相当于删除
  const withoutQuery = file.replace(/\?.*/, '')
  // 获取文件后缀
  const extension = path.extname(withoutQuery).slice(1)
  return {
    file,
    extension,
    fileWithoutQuery: withoutQuery,
    // 文件类型
    asType: getPreloadType(extension)
  }
}

// 根据传入的后缀名 返回对应的类型
function getPreloadType (ext: string): string {
  if (ext === 'js') {
    return 'script'
  } else if (ext === 'css') {
    return 'style'
  } else if (/jpe?g|png|svg|gif|webp|ico/.test(ext)) {
    return 'image'
  } else if (/woff2?|ttf|otf|eot/.test(ext)) {
    return 'font'
  } else {
    // not exhausting all possibilities here, but above covers common cases
    return ''
  }
}
