/* @flow */

import { escape } from 'web/server/util'
import { SSR_ATTR } from 'shared/constants'
import { RenderContext } from './render-context'
import { generateComponentTrace } from 'core/util/debug'
import { ssrCompileToFunctions } from 'web/server/compiler'
import { installSSRHelpers } from './optimizing-compiler/runtime-helpers'

import { isDef, isUndef, isTrue } from 'shared/util'

import {
  createComponent,
  createComponentInstanceForVnode
} from 'core/vdom/create-component'

let warned = Object.create(null)
// 调用多次 也会只显示一次
const warnOnce = msg => {
  // warned 根据msg作为键缓存
  if (!warned[msg]) {
    warned[msg] = true
    console.warn(`\n\u001b[31m${msg}\u001b[39m\n`)
  }
}

// 编译模板 错误的回调
const onCompilationError = (err, vm) => {
  // 有vm就生成调用栈信息 没有就为空
  const trace = vm ? generateComponentTrace(vm) : ''
  // 直接抛出异常
  throw new Error(`\n\u001b[31m${err}${trace}\u001b[39m\n`)
}

// 序列化渲染
const normalizeRender = vm => {
  const { render, template, _scopeId } = vm.$options
  if (isUndef(render)) {
    if (template) {
      // 有模板 没有render函数
      // 编译模板
      const compiled = ssrCompileToFunctions(template, {
        scopeId: _scopeId,
        warn: onCompilationError
      }, vm)

      // 编译之后赋值render函数
      vm.$options.render = compiled.render
      vm.$options.staticRenderFns = compiled.staticRenderFns
    } else {
      // 没有render函数 也没有模板 就报错
      throw new Error(
        `render function or template not defined in component: ${
          vm.$options.name || vm.$options._componentTag || 'anonymous'
        }`
      )
    }
  }
}

// 渲染节点
function renderNode (node, isRoot, context) {
  if (node.isString) {
    // 文本节点
    renderStringNode(node, context)
  } else if (isDef(node.componentOptions)) {
    // 组件节点
    renderComponent(node, isRoot, context)
  } else if (isDef(node.tag)) {
    // 元素节点
    renderElement(node, isRoot, context)
  } else if (isTrue(node.isComment)) {
    // 注释节点
    if (isDef(node.asyncFactory)) {
      // async component
      // 异步组件
      renderAsyncComponent(node, isRoot, context)
    } else {
      // 真正的注释节点
      context.write(`<!--${node.text}-->`, context.next)
    }
  } else {
    // 按文本节点处理
    context.write(
      node.raw ? node.text : escape(String(node.text)),
      context.next
    )
  }
}

// 利用缓存 注册组件
function registerComponentForCache (options, write) {
  // exposed by vue-loader, need to call this if cache hit because
  // component lifecycle hooks will not be called.
  const register = options._ssrRegister
  // 先取缓存标记 为true  并且设置了_ssrRegister
  if (write.caching && isDef(register)) {
    // _ssrRegister 添加在组件缓存数组中
    write.componentBuffer[write.componentBuffer.length - 1].add(register)
  }
  return register
}

// 渲染组件
function renderComponent (node, isRoot, context) {
  const { write, next, userContext } = context

  // check cache hit
  const Ctor = node.componentOptions.Ctor
  const getKey = Ctor.options.serverCacheKey
  const name = Ctor.options.name
  const cache = context.cache
  const registerComponent = registerComponentForCache(Ctor.options, write)

  if (isDef(getKey) && isDef(cache) && isDef(name)) {
    const key = name + '::' + getKey(node.componentOptions.propsData)
    const { has, get } = context
    if (isDef(has)) {
      has(key, hit => {
        if (hit === true && isDef(get)) {
          get(key, res => {
            if (isDef(registerComponent)) {
              registerComponent(userContext)
            }
            res.components.forEach(register => register(userContext))
            write(res.html, next)
          })
        } else {
          renderComponentWithCache(node, isRoot, key, context)
        }
      })
    } else if (isDef(get)) {
      get(key, res => {
        if (isDef(res)) {
          if (isDef(registerComponent)) {
            registerComponent(userContext)
          }
          res.components.forEach(register => register(userContext))
          write(res.html, next)
        } else {
          renderComponentWithCache(node, isRoot, key, context)
        }
      })
    }
  } else {
    if (isDef(getKey) && isUndef(cache)) {
      warnOnce(
        `[vue-server-renderer] Component ${
          Ctor.options.name || '(anonymous)'
        } implemented serverCacheKey, ` +
        'but no cache was provided to the renderer.'
      )
    }
    if (isDef(getKey) && isUndef(name)) {
      warnOnce(
        `[vue-server-renderer] Components that implement "serverCacheKey" ` +
        `must also define a unique "name" option.`
      )
    }
    renderComponentInner(node, isRoot, context)
  }
}

// 带缓存的组件渲染
function renderComponentWithCache (node, isRoot, key, context) {
  const write = context.write
  write.caching = true
  const buffer = write.cacheBuffer
  const bufferIndex = buffer.push('') - 1
  const componentBuffer = write.componentBuffer
  componentBuffer.push(new Set())
  context.renderStates.push({
    type: 'ComponentWithCache',
    key,
    buffer,
    bufferIndex,
    componentBuffer
  })
  renderComponentInner(node, isRoot, context)
}

function renderComponentInner (node, isRoot, context) {
  const prevActive = context.activeInstance
  // expose userContext on vnode
  node.ssrContext = context.userContext
  const child = context.activeInstance = createComponentInstanceForVnode(
    node,
    context.activeInstance
  )
  normalizeRender(child)
  const childNode = child._render()
  childNode.parent = node
  context.renderStates.push({
    type: 'Component',
    prevActive
  })
  renderNode(childNode, isRoot, context)
}

// 渲染异步组件
function renderAsyncComponent (node, isRoot, context) {
  const factory = node.asyncFactory

  const resolve = comp => {
    if (comp.__esModule && comp.default) {
      comp = comp.default
    }
    const { data, children, tag } = node.asyncMeta
    const nodeContext = node.asyncMeta.context
    const resolvedNode: any = createComponent(
      comp,
      data,
      nodeContext,
      children,
      tag
    )
    if (resolvedNode) {
      if (resolvedNode.componentOptions) {
        // normal component
        renderComponent(resolvedNode, isRoot, context)
      } else if (!Array.isArray(resolvedNode)) {
        // single return node from functional component
        renderNode(resolvedNode, isRoot, context)
      } else {
        // multiple return nodes from functional component
        context.renderStates.push({
          type: 'Fragment',
          children: resolvedNode,
          rendered: 0,
          total: resolvedNode.length
        })
        context.next()
      }
    } else {
      // invalid component, but this does not throw on the client
      // so render empty comment node
      context.write(`<!---->`, context.next)
    }
  }

  if (factory.resolved) {
    resolve(factory.resolved)
    return
  }

  const reject = context.done
  let res
  try {
    res = factory(resolve, reject)
  } catch (e) {
    reject(e)
  }
  if (res) {
    if (typeof res.then === 'function') {
      res.then(resolve, reject).catch(reject)
    } else {
      // new syntax in 2.3
      const comp = res.component
      if (comp && typeof comp.then === 'function') {
        comp.then(resolve, reject).catch(reject)
      }
    }
  }
}

// 渲染文本节点
function renderStringNode (el, context) {
  // RenderContext 实例
  const { write, next } = context
  // 是否有子节点
  if (isUndef(el.children) || el.children.length === 0) {
    // 没有直接调用write
    write(el.open + (el.close || ''), next)
  } else {
    // 子节点数组
    const children: Array<VNode> = el.children
    // 当元素节点处理
    context.renderStates.push({
      type: 'Element',
      children,
      rendered: 0,
      total: children.length,
      endTag: el.close
    })
    write(el.open, next)
  }
}

// 渲染元素
function renderElement (el, isRoot, context) {
  // 上下文实例中取值
  const { write, next } = context

  // 是否是根节点
  if (isTrue(isRoot)) {
    // 根节点 初始化数据 设置 data-server-rendered标记
    if (!el.data) el.data = {}
    if (!el.data.attrs) el.data.attrs = {}
    el.data.attrs[SSR_ATTR] = 'true'
  }

  // 缓存
  if (el.fnOptions) {
    registerComponentForCache(el.fnOptions, write)
  }

  // 渲染开始标签
  const startTag = renderStartingTag(el, context)
  // 渲染结束标签
  const endTag = `</${el.tag}>`

  // 是否是自闭合标签
  if (context.isUnaryTag(el.tag)) {
    // 是自闭合标签直接调用write
    write(startTag, next)
  } else if (isUndef(el.children) || el.children.length === 0) {
    // 没有子节点 直接调用write
    write(startTag + endTag, next)
  } else {
    // 获取到所有的子节点
    const children: Array<VNode> = el.children
    // 当成元素添加到渲染队列中
    context.renderStates.push({
      type: 'Element',
      children,
      rendered: 0,
      total: children.length,
      endTag
    })
    write(startTag, next)
  }
}

// vnode是否有父vnode data
function hasAncestorData (node: VNode) {
  // 递归向上找
  const parentNode = node.parent
  return isDef(parentNode) && (isDef(parentNode.data) || hasAncestorData(parentNode))
}

// 获得v-show指令
function getVShowDirectiveInfo (node: VNode): ?VNodeDirective {
  let dir: VNodeDirective
  let tmp

  // 一直向上找
  while (isDef(node)) {
    // 有指令
    if (node.data && node.data.directives) {
      // 指令中有v-show
      tmp = node.data.directives.find(dir => dir.name === 'show')
      if (tmp) {
        // 赋值给外层遍历
        dir = tmp
      }
    }
    node = node.parent
  }
  // 找到的是最外层的指令内容
  return dir
}

// 渲染开始标签
function renderStartingTag (node: VNode, context) {
  // 拼接好开始标签 标签名的字符串
  let markup = `<${node.tag}`
  const { directives, modules } = context

  // construct synthetic data for module processing
  // because modules like style also produce code by parent VNode data
  // 祖先vnode是否有data
  if (isUndef(node.data) && hasAncestorData(node)) {
    node.data = {}
  }
  if (isDef(node.data)) {
    // check directives
    const dirs = node.data.directives
    // 获取到指令
    if (dirs) {
      // 遍历指令
      // 如果是v-show指令就执行一下具体逻辑
      // 其他指令 忽略
      for (let i = 0; i < dirs.length; i++) {
        const name = dirs[i].name
        const dirRenderer = directives[name]
        // v-show
        if (dirRenderer && name !== 'show') {
          // directives mutate the node's data
          // which then gets rendered by modules
          dirRenderer(node, dirs[i])
        }
      }
    }

    // v-show directive needs to be merged from parent to child
    // v-show的具体内容
    const vshowDirectiveInfo = getVShowDirectiveInfo(node)
    if (vshowDirectiveInfo) {
      // renderContext传入的directives
      directives.show(node, vshowDirectiveInfo)
    }

    // apply other modules
    // renderContext 创建的时候传入的modules 遍历执行 把结果拼接到开始标签上
    for (let i = 0; i < modules.length; i++) {
      const res = modules[i](node)
      if (res) {
        markup += res
      }
    }
  }
  // attach scoped CSS ID
  let scopeId
  // 当前激活的vm实例
  const activeInstance = context.activeInstance
  if (isDef(activeInstance) &&
    activeInstance !== node.context &&
    isDef(scopeId = activeInstance.$options._scopeId)
  ) {
    // 拼上scopeId
    markup += ` ${(scopeId: any)}`
  }
  // 如果有fnScopeId 就拼上
  if (isDef(node.fnScopeId)) {
    markup += ` ${node.fnScopeId}`
  } else {
    // 一直向上找 拼上scopeId
    while (isDef(node)) {
      if (isDef(scopeId = node.context.$options._scopeId)) {
        markup += ` ${scopeId}`
      }
      node = node.parent
    }
  }
  // 拼接闭合开始标签
  return markup + '>'
}

// 创建render函数的方法
export function createRenderFunction (
  modules: Array<(node: VNode) => ?string>,
  directives: Object,
  isUnaryTag: Function,
  cache: any
) {
  // 返回一个render函数
  return function render (
    component: Component,
    write: (text: string, next: Function) => void,
    userContext: ?Object,
    done: Function
  ) {
    // 已经显示过的警告
    warned = Object.create(null)
    // 创建一个渲染上下文对象
    const context = new RenderContext({
      activeInstance: component,
      userContext,
      write, done, renderNode,
      isUnaryTag, modules, directives,
      cache
    })
    // 对组件扩展_ssrXxx 的方法
    installSSRHelpers(component)
    // 模板还是render函数统一一下
    normalizeRender(component)
    // 渲染节点
    renderNode(component._render(), true, context)
  }
}
