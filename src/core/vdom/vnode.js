/* @flow */

export default class VNode {
  // vnode标签名
  tag: string | void;
  // vnode data  可以包含的数据 如属性等等
  data: VNodeData | void;
  // vnode子节点数组
  children: ?Array<VNode>;
  // vnode文本节点
  text: string | void;
  // 真实dom的引用
  elm: Node | void;
  // vnode命名空间
  ns: string | void;
  // 上下文
  context: Component | void; // rendered in this component's scope
  // 子节点key属性
  key: string | number | void;
  // 组件配置项
  componentOptions: VNodeComponentOptions | void;
  // 子组件vm的实例
  componentInstance: Component | void; // component instance
  // 父vnode
  parent: VNode | void; // component placeholder node


  // strictly internal
  // 是否为原生HTML或只是普通文本(文本节点)
  raw: boolean; // contains raw HTML? (server only)
  // 静态节点标志 keep-alive
  isStatic: boolean; // hoisted static node
  // 是否作为根节点插入
  isRootInsert: boolean; // necessary for enter transition check
  // 是否是注释节点的标识
  isComment: boolean; // empty comment placeholder?
  // 是否是通过克隆别的vnode创建出来的节点标识
  isCloned: boolean; // is a cloned node?
  // 是否为v-once节点
  isOnce: boolean; // is a v-once node?
  // 异步工厂方法
  asyncFactory: Function | void; // async component factory function
  // 异步Meta
  asyncMeta: Object | void;
  // 是否为异步组件的占位
  isAsyncPlaceholder: boolean;
  // ssr上下文
  ssrContext: Object | void;
  // 函数化组件上下文
  fnContext: Component | void; // real context vm for functional nodes
  // 函数化组件配置项
  fnOptions: ?ComponentOptions; // for SSR caching
  // 函数化组件ScopeId
  fnScopeId: ?string; // functional scope id support

  constructor (
    tag?: string,
    data?: VNodeData,
    children?: ?Array<VNode>,
    text?: string,
    elm?: Node,
    context?: Component,
    componentOptions?: VNodeComponentOptions,
    asyncFactory?: Function
  ) {
    this.tag = tag
    this.data = data
    this.children = children
    this.text = text
    this.elm = elm
    this.ns = undefined
    this.context = context
    this.fnContext = undefined
    this.fnOptions = undefined
    this.fnScopeId = undefined
    this.key = data && data.key
    this.componentOptions = componentOptions
    this.componentInstance = undefined
    this.parent = undefined
    this.raw = false
    this.isStatic = false
    this.isRootInsert = true
    this.isComment = false
    this.isCloned = false
    this.isOnce = false
    this.asyncFactory = asyncFactory
    this.asyncMeta = undefined
    this.isAsyncPlaceholder = false
  }

  // DEPRECATED: alias for componentInstance for backwards compat.
  /* istanbul ignore next */
  // backwards compat向下兼容
  // componentInstance和child是同一个东西
  // 比如 用户之前使用老版本的vue现在要升级到新版本的vue
  get child (): Component | void {
    return this.componentInstance
  }
}


// 创建一个空节点 只有text属性位空字符串  isComment标记为注释节点
export const createEmptyVNode = (text: string = '') => {
  const node = new VNode()
  node.text = text
  node.isComment = true
  return node
}

// 创建一个文本节点 只有text属性
export function createTextVNode (val: string | number) {
  return new VNode(undefined, undefined, undefined, String(val))
}

// optimized shallow clone
// used for static nodes and slot nodes because they may be reused across
// multiple renders, cloning them avoids errors when DOM manipulations rely
// on their elm reference.
// 克隆vnode
// 把传入的vnode所有属性作为构造函数的参数 再重新创建一个
// isCloned标记为true
export function cloneVNode (vnode: VNode): VNode {
  // 构造函数只有八个参数 其他的参数只能在实例化之后 通过= 赋值
  const cloned = new VNode(
    vnode.tag,
    vnode.data,
    vnode.children,
    vnode.text,
    vnode.elm,
    vnode.context,
    vnode.componentOptions,
    vnode.asyncFactory
  )
  cloned.ns = vnode.ns
  cloned.isStatic = vnode.isStatic
  cloned.key = vnode.key
  cloned.isComment = vnode.isComment
  cloned.fnContext = vnode.fnContext
  cloned.fnOptions = vnode.fnOptions
  cloned.fnScopeId = vnode.fnScopeId
  cloned.asyncMeta = vnode.asyncMeta
  cloned.isCloned = true
  return cloned
}
