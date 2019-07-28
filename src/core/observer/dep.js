/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'

let uid = 0

// 订阅者就是watcher
/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
// 建立和watcher的桥梁
export default class Dep {
  // target就是当前的watcher
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;  // 订阅这个数据的watcher

  constructor () {
    this.id = uid++
    this.subs = []
  }

  // 把watcher往subs上添加订阅
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  // 删除wathcer订阅者
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 依赖收集
  depend () {
    // Dep.target 就是一个watcher  调用wathcer.addDep(this)
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  // 调用所有的订阅者的update方法
  notify () {
    // stabilize the subscriber list first
    // 复制所有的subs
    const subs = this.subs.slice()
    // 遍历调用所有watcher.update()
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// the current target watcher being evaluated.
// this is globally unique because there could be only one
// watcher being evaluated at any time.
Dep.target = null
const targetStack = []

// 把当前target赋值给Dep.target的静态属性
export function pushTarget (_target: ?Watcher) {
  // 如果Dep.target有值就先放入targetStack中
  if (Dep.target) targetStack.push(Dep.target)
  Dep.target = _target
}

// 把targetStack中取一个值然后赋值给Dep.target
export function popTarget () {
  Dep.target = targetStack.pop()
}
