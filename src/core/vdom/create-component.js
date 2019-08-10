/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch
const componentVNodeHooks = {
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // keep-alive的case
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      // 返回了子组件vm的实例 给vnode下加一个引用
      // vnode占位符vnode
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      )
      // 调用生命周期方法
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },

  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      // 调用子组件的挂载生命周期
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }

    // 如果使用了 keep-alive
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        // 已经挂载过了
        queueActivatedComponent(componentInstance)
      } else {
        // 还没有挂载过
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  // 组件销毁的时候
  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        // 对于非keepAlive 直接调用函数销毁
        componentInstance.$destroy()
      } else {
        // 对于keepAlive组件 调用deactivated hook
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

// 获取生命周期的key 是 ['init', 'prepatch', 'insert', 'destroy']
const hooksToMerge = Object.keys(componentVNodeHooks)

// 创建一个组件占位符vnode 就是在父组件里面声明的<child></child> 对应的vnode
export function createComponent (
  Ctor: Class<Component> | Function | Object | void,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }

  // _base 实际就是Vue
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // 如果传入的Ctor是一个对象 就使用 Vue.extend 扩张一个构造器
  // 如果是一个对象 八成就是传入的options
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor)
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  // 如果构造器有问题 就警告
  // 构造器可能是传入的 也可能是Vue.extend生成的
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  // 异步组件
  let asyncFactory
  if (isUndef(Ctor.cid)) {
    // 先把异步组件的传入 工厂函数、promise、高级异步组件做个缓存
    asyncFactory = Ctor
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor, context)
    // 异步加载js会返回undefined
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      // 第一次渲染的时候 因为是异步的所以都会返回undefined  在这里渲染成一个注释节点
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  resolveConstructorOptions(Ctor)

  // transform component v-model data into props & events
  // 在编译阶段 如果对组件设置了 v-model就会在这里 有data.model
  if (isDef(data.model)) {
    // 转换成 props 和 events
    transformModel(Ctor.options, data)
  }

  // extract props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 如果是一个组件，组件中有on就是自定义事件
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  // 把原生事件赋值给 on
  data.on = data.nativeOn

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node
  // 给要创建的组件vnodeData  添加hook函数 添加到组件hook上
  // 在patch过程中执行不同的生命周期
  installComponentHooks(data)

  // return a placeholder vnode
  // 生成vnode
  const name = Ctor.options.name || tag
  // 生成组件vnode  组件vnode没有children有componentOptions
  // 父组件中的children 是slot用到的 创建vnode的时候把children当做 vnode.option的一项 在renderSlot中用到
  //  { Ctor, propsData, listeners, tag, children } 都当做Vnode的option
  // 组件vnode的children是为空的
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  // 返回创建的占位符vnode  主要内容就是 VNodeData上有hook  有componentOptions
  return vnode
}

// 创建组件vnode
export function createComponentInstanceForVnode (
  // 传入的vnode 占位符
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  // 实际上是当前vm的实例  作为子组件的父
  parent: any, // activeInstance in lifecycle state
): Component {
  // 构造options
  const options: InternalComponentOptions = {
    _isComponent: true,  // 是组件
    _parentVnode: vnode, // 占位节点 传入的vnode  <HelloWorld></HelloWorld>这样一个节点
    parent // 当前激活组件 vm实例  如果要创建子节点 证明要再当前激活的vm下创建子节点 从而建立父子关系
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // vnode.componentOptions.Ctor 就是 Vue.extend 中的SUB 创建一个vue实例
  // 生成组件vnode的时候 把{ Ctor, propsData, listeners, tag, children }当做options传入
  // 新建了一个组件的vm实例
  return new vnode.componentOptions.Ctor(options)
}

function installComponentHooks (data: VNodeData) {
  // 如果没有就赋值一个空对象
  const hooks = data.hook || (data.hook = {})
  // hooksToMerge 是 init prepatch insert destroy字符串组成的数组
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    // 是否存在hook  vnode.data.hook中有当前遍历到的hook取出来
    const existing = hooks[key]
    // 原有的hook
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      // 如果已经有指定的hook 就merge已有的和原有的hook 否则 就只有原有的
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  // 合并方法 如果被调用就依次调用已有的和原有的hook
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  // 是否已经合并过的标记
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data: any) {
  // options.model 可以指定 {data(){return {}}, model: {prop: 'aaa', event: 'bbb'}}

  // 默认 prop就是value
  const prop = (options.model && options.model.prop) || 'value'
  // event 就是input
  const event = (options.model && options.model.event) || 'input'
  ;(data.props || (data.props = {}))[prop] = data.model.value   // 如果没有props就放一个空对象 把value加在props上

  // 如果没有事件 就加一个空对象
  const on = data.on || (data.on = {})

  // 如果已经有了 input事件 就合并成一个数组
  if (isDef(on[event])) {
    on[event] = [data.model.callback].concat(on[event])
  } else {
    // 如果没有input事件 就直接赋值
    on[event] = data.model.callback
  }
}
