/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  handleError,
  emptyObject,
  validateProp
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function initLifecycle (vm: Component) {
  const options = vm.$options

  // locate first non-abstract parent
  let parent = options.parent
  // 建立父子组件链  但不会包含抽象组件
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 在子组件中拿到父组件的引用后 把当前的vm实例放到父组件的$children中
    // 可能有多个children 把当前子组件的vm实例push进父组件指向的$children数组
    parent.$children.push(vm)
  }

  // 当前子组件的$parent 指向父组件的vm
  vm.$parent = parent
  // 如果有父级就把父级指向的$root赋值给当前组件 如果没有父级当前组件就是$root
  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  // 首次渲染的时候会被调用  数据改变的时候会被调用
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    // 缓存this到局部变量vm
    const vm: Component = this
    // 要挂载的真实dom节点  通过传入的选择器选中的
    const prevEl = vm.$el
    // 首次渲染的时候没有vm._vnode 上次的渲染vnode
    const prevVnode = vm._vnode
    // 每次调用update 把当前的实例赋值给上一次激活的实例记录
    const prevActiveInstance = activeInstance
    // 然后把当前的vm赋值 初始化子组件的时候拿到的就是父组件的vm
    activeInstance = vm
    // 当前生成的vnode 赋值给vm._vnode 渲染vnode就是render()之后生成的vnode
    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {
      // initial render
      // 初始化的时候调用  第一次渲染传入的第一个参数是真实dome  第二个是vnode
      // vm.$el传入的是老dom节点  返回的是创建完成的dom节点
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      // 数据更新的时候调用
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    // 当前vm patch完成之后 把上个激活的实例还原成当前正在激活状态的vm
    activeInstance = prevActiveInstance
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      // 如果有_watcher 就说明是渲染watcher
      // 调用他的update
      vm._watcher.update()
    }
  }

  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    // 调用生命周期
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    // 把所有子组件销毁
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook
    // 移除watcher 删除dom 之后调用销毁生命周期
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

// 真正的mount方法
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  // 缓存el  把el放在vm.$el上
  vm.$el = el
  // 没有render函数 或者 没有template编译的render函数
  if (!vm.$options.render) {
    // 把render函数赋值成一个 创建一个空的vnode的函数
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      // 用了runtime-only版本 还用template 没有写render函数 的警告
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 执行生命周期 挂载之前调用
  callHook(vm, 'beforeMount')

  let updateComponent
  /* istanbul ignore if */
  // 性能埋点
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      // 渲染开始
      mark(startTag)
      const vnode = vm._render()    // a行
      // 渲染结束
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      // 更新开始
      mark(startTag)
      vm._update(vnode, hydrating)  // b行
      // 更新结束
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)

      // 上面一大堆 a/b行 和非性能埋点vm._update(vm._render(), hydrating) 是一样的 只是为了方便计算
    }
  } else {
    // 这个方法被赋值给了渲染watcher中的 getter 就是每次被调用的时候都会执行这个方法
    // 定一个方法在watcher中使用
    updateComponent = () => {
      // vm._render() 返回一个虚拟dom节点 vnode
      // vm._update把vnode渲染成一个真实的dom节点
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 创建一个渲染watcher
  // 初始化渲染一次 后续数据改变都会被渲染
  // 下面是Watcher的传参
  // vm: Component,               vm
  // expOrFn: string | Function,  updateComponent
  // cb: Function,                noop
  // options?: ?Object,           配置对象
  // isRenderWatcher?: boolean    是否是渲染watcher标记
  new Watcher(vm, updateComponent, noop, {
    before () {
      // 每次调用watcher.before()都会调用组件的beforeUpdate生命周期
      // 已经执行过mounted再更新节点才走beforeUpdate生命周期
      if (vm._isMounted) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  // 父vnode为空 说明当前节点是一个根节点的时候 执行挂载方法
  if (vm.$vnode == null) {
    // 放一个标记
    vm._isMounted = true
    // 调用mounted生命周期方法
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren
  const hasChildren = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    parentVnode.data.scopedSlots || // has new scoped slots
    vm.$scopedSlots !== emptyObject // has old scoped slots
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (hasChildren) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

// 执行activated的生命周期
export function activateChildComponent (vm: Component, direct?: boolean) {
  // 递归的时候 保证不重复调用 设置标记位
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    // 递归执行子组件的activated
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

// 执行deactivated的生命周期
export function deactivateChildComponent (vm: Component, direct?: boolean) {
  // 递归的时候 保证不重复调用 设置标记位
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    // 递归执行子组件的deactivated
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

// vm实例  hook具体生命周期的字符串
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  // 之前的配置合并会把所有的生命周期方法 放在$options上
  const handlers = vm.$options[hook]
  // handlers是一个数组
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      try {
        // 调用每个生命周期的时候 call(vm) 在每个生命周期里面使用this都是vm
        handlers[i].call(vm)
      } catch (e) {
        handleError(e, vm, `${hook} hook`)
      }
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
