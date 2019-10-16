/* @flow */

const Transform = require('stream').Transform
import type TemplateRenderer from './index'
import type { ParsedTemplate } from './parse-template'

// 继承 Transform
export default class TemplateStream extends Transform {
  started: boolean;
  renderer: TemplateRenderer;
  template: ParsedTemplate;
  context: Object;
  inject: boolean;

  constructor (
    renderer: TemplateRenderer,
    template: ParsedTemplate,
    context: Object
  ) {
    super()
    // 初始化变量
    this.started = false
    this.renderer = renderer
    this.template = template
    this.context = context || {}
    this.inject = renderer.inject
  }

  _transform (data: Buffer | string, encoding: string, done: Function) {
    // 没有开始 就发送 beforeStart 调用start
    if (!this.started) {
      this.emit('beforeStart')
      this.start()
    }
    // push data调用回调
    this.push(data)
    done()
  }

  start () {
    // 设置标记
    this.started = true
    // 开始到head结束
    this.push(this.template.head(this.context))

    // 配置了inject
    if (this.inject) {
      // inline server-rendered head meta information
      // 上下文的head信息
      if (this.context.head) {
        this.push(this.context.head)
      }

      // inline preload/prefetch directives for initial/async chunks
      // 其他要先加载的模块
      const links = this.renderer.renderResourceHints(this.context)
      if (links) {
        this.push(links)
      }

      // CSS files and inline server-rendered CSS collected by vue-style-loader
      // 样式文件
      const styles = this.renderer.renderStyles(this.context)
      if (styles) {
        this.push(styles)
      }
    }

    // head结束到标记开始
    this.push(this.template.neck(this.context))
  }

  _flush (done: Function) {
    // 发送beforeEnd
    this.emit('beforeEnd')

    // 是否配置了inject
    if (this.inject) {
      // inline initial store state
      // vuex的状态注入
      const state = this.renderer.renderState(this.context)
      if (state) {
        this.push(state)
      }

      // embed scripts needed
      // script标签注入
      const scripts = this.renderer.renderScripts(this.context)
      if (scripts) {
        this.push(scripts)
      }
    }

    // 模板的尾部
    this.push(this.template.tail(this.context))
    done()
  }
}
