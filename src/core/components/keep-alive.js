/* @flow */

import { isRegExp, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'

type VNodeCache = { [key: string]: ?VNode };

// 如果没有设置name 就返回标签名
function getComponentName (opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag)
}

function matches (pattern: string | RegExp | Array<string>, name: string): boolean {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

// 排除节点条件变化的时候调用
function pruneCache (keepAliveInstance: any, filter: Function) {
  const { cache, keys, _vnode } = keepAliveInstance
  // 遍历已经缓存的节点
  for (const key in cache) {
    const cachedNode: ?VNode = cache[key]
    if (cachedNode) {
      const name: ?string = getComponentName(cachedNode.componentOptions)
      // 拿到组件节点的名称 如果不匹配过滤条件 就从缓存中删除
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

function pruneCacheEntry (
  cache: VNodeCache,
  key: string,
  keys: Array<string>,
  current?: VNode
) {
  // 拿到缓存
  const cached = cache[key]

  // 如果当前渲染的节点 是要删除的节点 就不要执行销毁
  if (cached && (!current || cached.tag !== current.tag)) {
    cached.componentInstance.$destroy()
  }

  // 从缓存中删除
  cache[key] = null
  remove(keys, key)
}

const patternTypes: Array<Function> = [String, RegExp, Array]

// keep-alive就是定义了一个组件  写了render函数 也包含其他的生命周期
export default {
  name: 'keep-alive',
  abstract: true,   // 抽象组件  不会渲染任何实体节点

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]   // 最大缓存组件数量
  },

  created () {
    // 空对象  保存vnode
    this.cache = Object.create(null)
    // 保留缓存的key值
    this.keys = []
  },

  destroyed () {
    // 把所有的缓存遍历一次 然后销毁
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted () {
    // watch传入的两个props 用于过滤某些不需要的节点
    this.$watch('include', val => {
      // 调用函数 传入 filter过滤方法
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  render () {
    // 就是<keep-alive>xxxxxxxxxxx</keep-alive> 中包含的内容
    const slot = this.$slots.default
    // 调用方法为了获得第一个组件节点    keep-alive只会缓存组件节点 对其他的节点没有作用
    const vnode: VNode = getFirstComponentChild(slot)
    // 获得第一个组件节点的componentOptions
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    if (componentOptions) {
      // check pattern
      // 获得组件名称     如果没有设置options.name 就返回标签名
      const name: ?string = getComponentName(componentOptions)

      // 通过组件名称 匹配 include  exclude     如果不需要缓存就直接返回
      const { include, exclude } = this
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      const { cache, keys } = this

      // 如果vnode.key没有  就自己拼接一个key    这个key就是缓存的标识
      const key: ?string = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      if (cache[key]) {
        // 如果之前缓存过

        // 就拿缓存的componentInstance 直接赋值
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        // 改变key的位置  标示着最新使用的  使用时间越近 在keys数组中越靠后
        remove(keys, key)
        keys.push(key)
      } else {
        // 如果之前没有缓存过

        // 就添加进缓存
        cache[key] = vnode
        keys.push(key)


        // prune oldest entry
        // 如果定义了max 缓存过大 就删除最远一个没有使用过的组件
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }

      vnode.data.keepAlive = true
    }
    return vnode || (slot && slot[0])
  }
}
