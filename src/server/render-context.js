/* @flow */

import { isUndef } from 'shared/util'

// 声明 几种状态
type RenderState = {
  type: 'Element';
  rendered: number;
  total: number;
  children: Array<VNode>;
  endTag: string;
} | {
  type: 'Fragment';
  rendered: number;
  total: number;
  children: Array<VNode>;
} | {
  type: 'Component';
  prevActive: Component;
} | {
  type: 'ComponentWithCache';
  buffer: Array<string>;
  bufferIndex: number;
  componentBuffer: Array<Set<Class<Component>>>;
  key: string;
};

// 创建一个渲染上下文 类
export class RenderContext {
  userContext: ?Object;
  activeInstance: Component;
  renderStates: Array<RenderState>;
  write: (text: string, next: Function) => void;
  renderNode: (node: VNode, isRoot: boolean, context: RenderContext) => void;
  next: () => void;
  done: (err: ?Error) => void;

  modules: Array<(node: VNode) => ?string>;
  directives: Object;
  isUnaryTag: (tag: string) => boolean;

  cache: any;
  get: ?(key: string, cb: Function) => void;
  has: ?(key: string, cb: Function) => void;

  constructor (options: Object) {
    // options初始化变量
    this.userContext = options.userContext
    this.activeInstance = options.activeInstance
    this.renderStates = []

    this.write = options.write
    this.done = options.done
    this.renderNode = options.renderNode

    this.isUnaryTag = options.isUnaryTag
    this.modules = options.modules
    this.directives = options.directives

    const cache = options.cache
    // 如果有cache 必须要有 get和set 否则报错
    if (cache && (!cache.get || !cache.set)) {
      throw new Error('renderer cache must implement at least get & set.')
    }
    this.cache = cache
    //
    this.get = cache && normalizeAsync(cache, 'get')
    this.has = cache && normalizeAsync(cache, 'has')
    // 改变上下文
    this.next = this.next.bind(this)
  }

  next () {
    // 从状态数组中取得最后一个
    const lastState = this.renderStates[this.renderStates.length - 1]
    // 判断是否为空
    if (isUndef(lastState)) {
      // 为空就调用完成的回调
      return this.done()
    }
    // 最后一个状态的type
    switch (lastState.type) {
      // 元素 或者 文本碎片
      case 'Element':
      case 'Fragment':
        // 最后一个状态  取得children, total
        const { children, total } = lastState
        // 渲染计数加1
        const rendered = lastState.rendered++
        if (rendered < total) {
          // 比总数还小 继续渲染节点  取得第几个节点
          this.renderNode(children[rendered], false, this)
        } else {
          // 大于等于总数的时候
          // 弹出一个状态
          this.renderStates.pop()
          // 元素 就调用write
          if (lastState.type === 'Element') {
            this.write(lastState.endTag, this.next)
          } else {
            // 否则调用next
            this.next()
          }
        }
        break
      case 'Component':
        // 组件节点
        // 弹出本次状态
        this.renderStates.pop()
        // 上次激活的实例赋值
        this.activeInstance = lastState.prevActive
        // 继续下一个
        this.next()
        break
      case 'ComponentWithCache':
        // 带缓存组件节点
        // 弹出本次状态
        this.renderStates.pop()
        // 简单的取值
        const { buffer, bufferIndex, componentBuffer, key } = lastState
        const result = {
          html: buffer[bufferIndex],
          components: componentBuffer[bufferIndex]
        }
        // 调用缓存对象的set
        this.cache.set(key, result)
        if (bufferIndex === 0) {
          // 最顶层的组件
          // 设置标记
          // this is a top-level cached component,
          // exit caching mode.
          this.write.caching = false
        } else {
          // parent component is also being cached,
          // merge self into parent's result
          // 存入缓存中
          buffer[bufferIndex - 1] += result.html
          // 记录上次的组件缓存
          const prev = componentBuffer[bufferIndex - 1]
          // 遍历所有组件 添加到上次缓存中
          result.components.forEach(c => prev.add(c))
        }
        buffer.length = bufferIndex
        componentBuffer.length = bufferIndex
        this.next()
        break
    }
  }
}

// 统一 函数的 参数
function normalizeAsync (cache, method) {
  // 从cache中取得 get 还是 set
  const fn = cache[method]
  // 异常处理 如果不存在就返回
  if (isUndef(fn)) {
    return
  } else if (fn.length > 1) {
    // 声明get/set的时候 参数列表大于一个的参数时候
    // 返回一个函数 调用的时候 传入key, cb
    return (key, cb) => fn.call(cache, key, cb)
  } else {
    // 只有一个参数的时候
    // 返回一个函数 调用的时候 传入key
    // cb回调的时候 传入get/set的返回值
    return (key, cb) => cb(fn.call(cache, key))
  }
}
