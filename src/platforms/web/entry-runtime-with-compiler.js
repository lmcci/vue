/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

// 通过id选择器 选中元素 并且返回innerHTML
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 先获取到原来的mount  在runtime+complier会有这段逻辑
const mount = Vue.prototype.$mount
// 原型链上挂载方法 实例可以使用
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 可以传入选择器  也可以传入dom对象
  el = el && query(el)

  /* istanbul ignore if */
  // el不能是body或者html标签   因为会替换原来的元素
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 没有定义render方法
  if (!options.render) {
    let template = options.template
    // 有没有在option中定义template字符串
    if (template) {
      if (typeof template === 'string') {
        // 如果是一个id选择器
        if (template.charAt(0) === '#') {
          // 获得选择器的innerHtml
          template = idToTemplate(template)
          /* istanbul ignore if */
          // 如果没有获取到template 就报警告
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 如果是一个dom元素 获得他的innerHTML
        template = template.innerHTML
      } else {
        // template 不是string 不是dom元素 报警告  返回this 就是vm
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 这个时候el已经从选择器 变成了dom元素了
      // 没有template的时候 根据el得到outerHTML 就是el本身的字符串
      template = getOuterHTML(el)
    }
    // template 是字符串 最终转换成render函数放在options上
    if (template) {
      /* istanbul ignore if */
      // 性能埋点
      // 开始编译
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // 调用compileToFunctions编译 把template编译成render函数
      const { render, staticRenderFns } = compileToFunctions(template, {
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      // 把render函数放在vm.$options上
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      // 性能埋点
      // 编译结束
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 最终会把template编译成render函数 放在options.render上   el是dom对象
  // 调用缓存的mount
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
// 获得outerhtml
function getOuterHTML (el: Element): string {
  // 如果浏览器支持outerHTML 就直接返回
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    // 不支持 就在外面包一层 然后再返回 相当于一种outerHTML兼容写法
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
