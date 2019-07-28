/* @flow */

import { emptyNode } from 'core/vdom/patch'
import { resolveAsset, handleError } from 'core/util/index'
import { mergeVNodeHook } from 'core/vdom/helpers/index'

export default {
  create: updateDirectives,
  update: updateDirectives,
  destroy: function unbindDirectives (vnode: VNodeWithData) {
    // 销毁的时候 把新的vnode传入空的
    updateDirectives(vnode, emptyNode)
  }
}

function updateDirectives (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (oldVnode.data.directives || vnode.data.directives) {
    _update(oldVnode, vnode)
  }
}

function _update (oldVnode, vnode) {
  // 根据新老节点判断 当前是创建过程中调用 还是销毁过程中调用
  const isCreate = oldVnode === emptyNode
  const isDestroy = vnode === emptyNode
  // data.directives 就是编译时生成的指令数组
  // 做一次序列化
  const oldDirs = normalizeDirectives(oldVnode.data.directives, oldVnode.context)
  const newDirs = normalizeDirectives(vnode.data.directives, vnode.context)

  const dirsWithInsert = []
  const dirsWithPostpatch = []

  let key, oldDir, dir
  // 遍历所有的指令
  for (key in newDirs) {
    oldDir = oldDirs[key]
    dir = newDirs[key]
    if (!oldDir) {
      // new directive, bind
      // 有新的 就执行bind生命周期
      callHook(dir, 'bind', vnode, oldVnode)
      // 如果这个指令有定义 并有inserted hook 就放在一个数组中
      if (dir.def && dir.def.inserted) {
        dirsWithInsert.push(dir)
      }
    } else {
      // existing directive, update
      // 如果之前就有 调用update生命周期
      dir.oldValue = oldDir.value
      callHook(dir, 'update', vnode, oldVnode)
      // 如果这个指令有定义 并有componentUpdated hook 就放在一个数组中
      if (dir.def && dir.def.componentUpdated) {
        dirsWithPostpatch.push(dir)
      }
    }
  }

  // 数组中有值 标示有新加入的bind
  if (dirsWithInsert.length) {
    // 定义一个回调 遍历数组中的方法 然后执行inserted
    const callInsert = () => {
      for (let i = 0; i < dirsWithInsert.length; i++) {
        callHook(dirsWithInsert[i], 'inserted', vnode, oldVnode)
      }
    }
    // 如果是第一次创建 就把回调合并到vnode的insert hook中  当vnode的insert被调用的时候执行
    // 如果不是 就直接调用
    if (isCreate) {
      mergeVNodeHook(vnode, 'insert', callInsert)
    } else {
      callInsert()
    }
  }

  // 和上面逻辑类似
  if (dirsWithPostpatch.length) {
    // 循环dirsWithPostpatch的方法 调用componentUpdated hook 作为回调
    // 把回调merge到vnode的postpatch hook中
    mergeVNodeHook(vnode, 'postpatch', () => {
      for (let i = 0; i < dirsWithPostpatch.length; i++) {
        callHook(dirsWithPostpatch[i], 'componentUpdated', vnode, oldVnode)
      }
    })
  }

  // 如果不是第一次创建  并且有老的指令 更新后不在新的指令列表中 就调用老的指令unbind hook
  // 因为销毁的时候 没有新的 相当于把老的全部销毁
  if (!isCreate) {
    for (key in oldDirs) {
      if (!newDirs[key]) {
        // no longer present, unbind
        callHook(oldDirs[key], 'unbind', oldVnode, oldVnode, isDestroy)
      }
    }
  }
}

const emptyModifiers = Object.create(null)

function normalizeDirectives (
  dirs: ?Array<VNodeDirective>,
  vm: Component
): { [key: string]: VNodeDirective } {
  const res = Object.create(null)
  if (!dirs) {
    // $flow-disable-line
    return res
  }
  let i, dir
  // 遍历所有的指令
  for (i = 0; i < dirs.length; i++) {
    dir = dirs[i]
    // 如果没有修饰符 就放个空的
    if (!dir.modifiers) {
      // $flow-disable-line
      dir.modifiers = emptyModifiers
    }
    // 把dir放在res中返回
    res[getRawDirName(dir)] = dir
    // 从$options上找directives 对象上原型上 驼峰写法等等   vm.$options.directives[dir.name]
    // 找到了返回
    // v-model的case返回的是 src/platforms/web/runtime/directives/model.js 中定义的对象
    dir.def = resolveAsset(vm.$options, 'directives', dir.name, true)
  }
  // $flow-disable-line
  return res
}

// 有rawName就用rawName  没有就用 name.modifier1.modifier2
function getRawDirName (dir: VNodeDirective): string {
  return dir.rawName || `${dir.name}.${Object.keys(dir.modifiers || {}).join('.')}`
}

// 如果有定义这个hook就调用一次
function callHook (dir, hook, vnode, oldVnode, isDestroy) {
  const fn = dir.def && dir.def[hook]
  if (fn) {
    try {
      fn(vnode.elm, dir, vnode, oldVnode, isDestroy)
    } catch (e) {
      handleError(e, vnode.context, `directive ${dir.name} ${hook} hook`)
    }
  }
}
