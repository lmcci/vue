/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving, shouldObserve
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// 设置代理
export function proxy (target: Object, sourceKey: string, key: string) {
  // 可枚举  可更改enumerable configurable get set
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)

  // 上面代码相当于
  // Object.defineProperty(target, key, {
  //   enumerable: true,
  //   configurable: true,
  //   get: function () {
  //     return this[sourceKey][key]
  //   },
  //   set: function (val) {
  //     this[sourceKey][key] = val
  //   }
  // })
}

export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  // 有props就初始化props
  if (opts.props) initProps(vm, opts.props)
  // 有methods就初始化methods
  if (opts.methods) initMethods(vm, opts.methods)
  // 有data就初始化data
  if (opts.data) {
    initData(vm)
  } else {
    // 没有data就赋值一个空对象 设置为根 把这个空对象变成响应式的
    observe(vm._data = {}, true /* asRootData */)
  }
  // 初始化computed
  if (opts.computed) initComputed(vm, opts.computed)
  // 初始化user watcher
  // 火狐在Object.prototype有watch方法 判断vm.$options.watch非浏览器的watch属性
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

// propsOptions 就是 vm.$options.props
function initProps (vm: Component, propsOptions: Object) {
  // 用new 创建一个Vue或者Vue的子类对象 的时候 可以穿入propsData 当做实例的props使用
  // $options.propsData 没有设置就用一个空对象代替
  const propsData = vm.$options.propsData || {}
  // 初始化 _props为空对象
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  // 给keys $options._propKeys设置为空数组
  const keys = vm.$options._propKeys = []
  // 如果没有$parent 就证明是根节点
  const isRoot = !vm.$parent
  // root instance props should be converted
  // 非根节点的时候 把shouldObserve值为false
  if (!isRoot) {
    toggleObserving(false)
  }

  // propsOptions 就是vm.$options.props
  // 遍历props
  for (const key in propsOptions) {
    // 取出所有的key
    keys.push(key)
    // 获得prop的值 其中有校验逻辑
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    // 非生产环境多报警告  最终都调用 defineReactive 把属性变成响应式的
    if (process.env.NODE_ENV !== 'production') {
      // 把key 转换成-连接的小写单词
      const hyphenatedKey = hyphenate(key)
      // key,ref,slot,slot-scope,is 如果这个key是其中的一个
      // 或者全局配置中能匹配到是保留的属性
      // 就报警告
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (vm.$parent && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 设置_props为一个代理  相当于 访问 this.xxx => this._props.xxx
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  // 设置shouldObserve为true
  toggleObserving(true)
}

function initData (vm: Component) {
  // new Vue中传入option的data
  let data = vm.$options.data
  // 可以是一个对象 也可以是一个返回一个对象的函数
  // 最终赋值给 data  vm._data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)   // 调用函数获得data对象
    : data || {}
  // 如果不是一个对象就现实一个警告 赋值给data一个空对象
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  // 拿到data的所有key
  const keys = Object.keys(data)
  // 拿到所有的props
  const props = vm.$options.props
  // 拿到所有的methods
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    // 如果data中定义了和methods同样的变量名就输出一个警告
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    // 如果data中定义了和props同样的变量名就输出一个警告
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {  // 判断string字符串是否以 $ _开头  如果返回true就证明是内置/保留的键
      // 设置代理 如果访问 vm[key] 就相当于访问vm['_data'][key]
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 把data变成响应式
  observe(data, true /* asRootData */)
}

// 如果data是一个function就在这里执行
export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  // 把当前target赋值给Dep.target的静态属性
  pushTarget()
  try {
    // 调用data并返回他的值
    return data.call(vm, vm)
  } catch (e) {
    // 调用方法抛出异常 输出错误信息
    handleError(e, vm, `data()`)
    // 有异常就返回空对象
    return {}
  } finally {
    // 把targetStack中取一个值然后赋值给Dep.target
    popTarget()
  }
}

const computedWatcherOptions = { computed: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  // 计算属性的watcher 赋默认值
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  // 是否是服务端渲染
  const isSSR = isServerRendering()

  // 遍历所有的计算属性
  for (const key in computed) {
    // 取得用户定义的computed内容
    const userDef = computed[key]

    // computed中每个可以是个函数 也可以是个对象
    const getter = typeof userDef === 'function' ? userDef : userDef.get

    // 如果是个对象 至少有个getter方法 否则非生产环境报警告
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 非ssr的时候 实例化一个watcher
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions  // { computed: true } 一个标示
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      // 定义计算属性
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 如果computed的key已经在data props中定义过就报警告
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 非ssr  现在只看true的情况
  const shouldCache = !isServerRendering()

  // comouted是个方法的比较常见
  if (typeof userDef === 'function') {
    // 创建一个computed getter
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : userDef
    // 不对setter赋值
    sharedPropertyDefinition.set = noop
  } else {
    // 使用对象的方式指定了getter 并且没有把cache设置为false
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : userDef.get
      : noop
    sharedPropertyDefinition.set = userDef.set
      ? userDef.set
      : noop
  }
  // 非生产环境 没有设置set的时候 如果对计算属性赋值 就报警告
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 给vm添加这个key的 getter 和 setter
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// computed属性的getter
function createComputedGetter (key) {
  // 返回这个函数当做getter
  return function computedGetter () {
    // _computedWatchers 在initComputed时是一个空对象
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      watcher.depend()
      // 通过getter获得值
      return watcher.evaluate()
    }
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (methods[key] == null) {
        warn(
          `Method "${key}" has an undefined value in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = methods[key] == null ? noop : bind(methods[key], vm)
  }
}

// 初始化watcher
function initWatch (vm: Component, watch: Object) {
  // 循环遍历 调用createWatcher
  for (const key in watch) {
    const handler = watch[key]
    // 当前遍历到的值是数组的时候
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // handler可以是一个对象 也可以是一个函数 可以是字符串
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  // 可以指定一个字符串 从vm中取 可能是一个methods的内容
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  // 规范化之后 handler就是回调函数
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  // 非生产环境下对$data $props赋值 报警告
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function (newData: Object) {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 访问$data $props 相当于访问 vm._data vm._props
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  // 原型链上添加方法
  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    // 因为可以直接调用 this.$watch 所以传入数据没有规范化 调用createWatcher规范化数据之后会再次调用这里
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    // 标记为user watcher
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 如果设置中传入immediate 就立即多调用一次传入的回调
    if (options.immediate) {
      cb.call(vm, watcher.value)
    }
    // 返回一个函数 调用的时候销毁 watcher
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
