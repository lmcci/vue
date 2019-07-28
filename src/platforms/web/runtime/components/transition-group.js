/* @flow */

// Provides transition support for list items.
// supports move transitions using the FLIP technique.

// Because the vdom's children update algorithm is "unstable" - i.e.
// it doesn't guarantee the relative positioning of removed elements,
// we force transition-group to update its children into two passes:
// in the first pass, we remove all nodes that need to be removed,
// triggering their leaving transition; in the second pass, we insert/move
// into the final desired state. This way in the second pass removed
// nodes will remain where they should be.

import { warn, extend } from 'core/util/index'
import { addClass, removeClass } from '../class-util'
import { transitionProps, extractTransitionData } from './transition'

import {
  hasTransition,
  getTransitionInfo,
  transitionEndEvent,
  addTransitionClass,
  removeTransitionClass
} from '../transition-util'

// 比transition多了两个 props
const props = extend({
  tag: String,
  moveClass: String
}, transitionProps)

delete props.mode

// transition-group 不是一个抽象组件  他会渲染一个真实的节点
export default {
  props,

  beforeMount () {
    // 对update做一次重写
    const update = this._update
    this._update = (vnode, hydrating) => {
      // force removing pass
      // 会调用两次patch

      // 需要删除的节点 先patch一次
      this.__patch__(
        this._vnode,
        this.kept,
        false, // hydrating
        true // removeOnly (!important, avoids unnecessary moves)
      )
      this._vnode = this.kept
      //
      update.call(this, vnode, hydrating)
    }
  },

  render (h: Function) {
    // 会渲染出一个真实dom节点  获取到指定的标签名 如果没有指定就是span
    const tag: string = this.tag || this.$vnode.data.tag || 'span'
    //
    const map: Object = Object.create(null)
    // 获取子节点 赋值给prevChildren
    const prevChildren: Array<VNode> = this.prevChildren = this.children
    // 取插槽的内容
    const rawChildren: Array<VNode> = this.$slots.default || []
    const children: Array<VNode> = this.children = []
    // 和transition一样  根据props和监听获得一些数据 上
    const transitionData: Object = extractTransitionData(this)

    // 遍历插槽的children
    for (let i = 0; i < rawChildren.length; i++) {
      const c: VNode = rawChildren[i]
      if (c.tag) {
        if (c.key != null && String(c.key).indexOf('__vlist') !== 0) {
          // 使用v-for生成列表的场景

          // 保存到children数组中
          children.push(c)
          // 保存key
          map[c.key] = c
          // 把props和listener放在vnode.data.transition中
          ;(c.data || (c.data = {})).transition = transitionData
        } else if (process.env.NODE_ENV !== 'production') {
          // 如果没有指定key就警告
          const opts: ?VNodeComponentOptions = c.componentOptions
          const name: string = opts ? (opts.Ctor.options.name || opts.tag || '') : c.tag
          warn(`<transition-group> children must be keyed: <${name}>`)
        }
      }
    }

    if (prevChildren) {
      const kept: Array<VNode> = []
      const removed: Array<VNode> = []
      // 遍历上次渲染的节点
      for (let i = 0; i < prevChildren.length; i++) {
        const c: VNode = prevChildren[i]
        c.data.transition = transitionData
        // 获取位置信息
        c.data.pos = c.elm.getBoundingClientRect()
        if (map[c.key]) {
          // 之前渲染的节点 在本次渲染的节点中 就保存进kept数组中
          kept.push(c)
        } else {
          // 之前渲染的节点 不在本次渲染的节点中 就保存进removed数组中
          removed.push(c)
        }
      }
      // 只渲染保留的节点
      this.kept = h(tag, null, kept)
      this.removed = removed
    }

    return h(tag, null, children)
  },

  updated () {
    // 获取到上次渲染的节点
    const children: Array<VNode> = this.prevChildren
    // 获取moveClass 如果没有指定就用 动画名-move  如果没有动画名 就用v-move
    const moveClass: string = this.moveClass || ((this.name || 'v') + '-move')
    // 检测是否定义了这个moveClass 如果没有定义就直接返回 定义了 还要检测里面是否有动画的样式
    if (!children.length || !this.hasMove(children[0].elm, moveClass)) {
      return
    }

    // we divide the work into three loops to avoid mixing DOM reads and writes
    // in each iteration - which helps prevent layout thrashing.
    // 遍历上次渲染的节点
    children.forEach(callPendingCbs)
    // 记录当前节点的位置
    children.forEach(recordPosition)
    //
    children.forEach(applyTranslation)

    // force reflow to put everything in position
    // assign to this to avoid being removed in tree-shaking
    // $flow-disable-line
    // 访问一次 触发浏览器重绘
    this._reflow = document.body.offsetHeight

    children.forEach((c: VNode) => {
      // 执行applyTranslation的时候 如果有偏移 moved为true
      if (c.data.moved) {
        var el: any = c.elm
        var s: any = el.style
        // 添加类名
        addTransitionClass(el, moveClass)
        // 移除 applyTranslation 中添加的动画
        s.transform = s.WebkitTransform = s.transitionDuration = ''
        // 当动画执行完毕的时候 把监听和class删除掉
        el.addEventListener(transitionEndEvent, el._moveCb = function cb (e) {
          if (!e || /transform$/.test(e.propertyName)) {
            el.removeEventListener(transitionEndEvent, cb)
            el._moveCb = null
            removeTransitionClass(el, moveClass)
          }
        })
      }
    })
  },

  methods: {
    hasMove (el: any, moveClass: string): boolean {
      /* istanbul ignore if */
      // 浏览器是否支持 transition
      if (!hasTransition) {
        return false
      }
      /* istanbul ignore if */
      // 相当于一次缓存
      if (this._hasMove) {
        return this._hasMove
      }
      // Detect whether an element with the move class applied has
      // CSS transitions. Since the element may be inside an entering
      // transition at this very moment, we make a clone of it and remove
      // all other transition classes applied to ensure only the move class
      // is applied.
      // 复制一个dom节点
      const clone: HTMLElement = el.cloneNode()
      // 先把之前添加的class全部都移除掉 后面要获取样式的时候有干扰
      if (el._transitionClasses) {
        el._transitionClasses.forEach((cls: string) => { removeClass(clone, cls) })
      }
      // 给赋值的节点添加要检测的类名
      addClass(clone, moveClass)
      // 先隐藏这个节点
      clone.style.display = 'none'
      // 然后添加这个复制借点
      this.$el.appendChild(clone)
      // 获取样式信息
      const info: Object = getTransitionInfo(clone)
      // 然后移除复制的节点
      this.$el.removeChild(clone)
      return (this._hasMove = info.hasTransform)
    }
  }
}

// 如果被多次调用 就立即执行 上次未执行完成的回调
function callPendingCbs (c: VNode) {
  /* istanbul ignore if */
  if (c.elm._moveCb) {
    c.elm._moveCb()
  }
  /* istanbul ignore if */
  if (c.elm._enterCb) {
    c.elm._enterCb()
  }
}

function recordPosition (c: VNode) {
  c.data.newPos = c.elm.getBoundingClientRect()
}

function applyTranslation (c: VNode) {
  // 获取新老位置
  const oldPos = c.data.pos
  const newPos = c.data.newPos
  // 计算新老位置的差值
  const dx = oldPos.left - newPos.left
  const dy = oldPos.top - newPos.top
  //
  if (dx || dy) {
    c.data.moved = true
    // 立即还原成之前的位置  然后才能再执行看到的动画
    const s = c.elm.style
    s.transform = s.WebkitTransform = `translate(${dx}px,${dy}px)`
    s.transitionDuration = '0s'
  }
}
