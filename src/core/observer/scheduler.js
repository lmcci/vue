/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []  // watcher数组
const activatedChildren: Array<Component> = []  // 激活的children
let has: { [key: number]: ?true } = {}  // queue保证不重复添加的标记
let circular: { [key: number]: number } = {}  // 循环更新
let waiting = false   // 标记
let flushing = false  // 标记
let index = 0   // 当前watcher的索引

/**
 * Reset the scheduler's state.
 */
// 重置标记状态
function resetSchedulerState () {
  // 清除队列
  index = queue.length = activatedChildren.length = 0
  // 清除标记
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  // 清除标记
  waiting = flushing = false
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  // 标记位
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 把queue中的watcher按id从小到大排序
  // 创建watcher是从父到子 所以id从小到大  更新watcher也要从夫到子
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // queue在for循环的时候有可能长度发生改变
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    // 如果wathcer有before回调就调用一次
    if (watcher.before) {
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    // 调用watcher.run()
    watcher.run()
    // in dev build, check and stop circular updates.
    // 无限更新的时候报错  有可能在watcher.run中在次调用queueWatcher 添加进queue
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()

  // 重置标记
  resetSchedulerState()

  // call component updated and activated hooks
  // keep-alive中组件如果初次挂载的时候activatedChildren会有值
  callActivatedHooks(activatedQueue)
  // 生命周期函数
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  // 倒着遍历 先执行子再执行父
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // 如果是渲染watcher就执行生命周期函数
    if (vm._watcher === watcher && vm._isMounted) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  // 设置标记位
  vm._inactive = false
  // 把当前vm实例放在数组中  flushSchedulerQueue 的时候会被调用vm的activated hook
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  // 遍历数组 调用生命周期 设置标记位
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 在同一个tick内 可能被多次调用 watcher.update() 真正执行的只有一次flushSchedulerQueue
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  // 当前watcher不在更新队列里面
  if (has[id] == null) {
    // 添加进一个watcher属性
    has[id] = true
    if (!flushing) {
      // 如果不是在刷新 就添加进queue中
      queue.push(watcher)
    } else {
      // 正在执行flushSchedulerQueue的时候  queueWatcher 再次被调用的时候执行这里
      // flushSchedulerQueue 调用开始的时候flushing为true  调用完毕的时候为false
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      // 插入到queue
      // 因为flushSchedulerQueue中已经对queue做过排序 所以这里插入的时候要按照id的大小找出索引插入
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    // 在下一个tick中执行flushSchedulerQueue
    if (!waiting) {
      waiting = true
      nextTick(flushSchedulerQueue)
    }
  }
}
