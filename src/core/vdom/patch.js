/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

// 判断两个vnode是否想等
function sameVnode (a, b) {
  return (
    a.key === b.key && (
      ( // tag相同  同时为注释节点 或者都不是注释节点  data定义是否相同
        a.tag === b.tag &&
        a.isComment === b.isComment &&
        isDef(a.data) === isDef(b.data) &&
        sameInputType(a, b)
      ) || ( // 异步占位符节点
        isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)
      )
    )
  )
}

// 判断是否是相同的input类型
function sameInputType (a, b) {
  // 因为已经判断过 a b 的tag了  所以如果有一个不是input类型就没有必要再判断了
  if (a.tag !== 'input') return true
  let i
  // a b  的data.attrs.type
  const typeA = isDef(i = a.data) && isDef(i = i.attrs) && i.type
  const typeB = isDef(i = b.data) && isDef(i = i.attrs) && i.type
  // text,number,password,search,email,tel,url type是其中一种
  return typeA === typeB || isTextInputType(typeA) && isTextInputType(typeB)
}

function createKeyToOldIdx (children, beginIdx, endIdx) {
  let i, key
  const map = {}
  // 从开始索引遍历到结束索引
  for (i = beginIdx; i <= endIdx; ++i) {
    // 取出每个children的key 放在map中返回
    key = children[i].key
    if (isDef(key)) map[key] = i
  }
  return map
}

export function createPatchFunction (backend) {
  let i, j
  const cbs = {}

  // 上面这里相当于一些初始化逻辑，当调用这个函数的时候执行，
  // 但是也返回一个函数，返回的函数执行的时候（__patch__）才执行下面定义的

  // modules就是各个模块  baseModules、platformModules的合并
  // nodeOps是平台相关操作dom的api
  const { modules, nodeOps } = backend

  // 把所有模块中的hook放在cbs中 每个键是一个数组
  for (i = 0; i < hooks.length; ++i) {
    // 对每个hook都创建一个数组  'create', 'activate', 'update', 'remove', 'destroy'
    cbs[hooks[i]] = []
    // 如果模块中有对应的hook就添加进cbs对应的hook中
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }

  // 把真实dom转换成vnode
  // 只有标签名 和 真实dom的引用
  function emptyNodeAt (elm) {
    // elm是真实dom的引用
    // 通过真实dom的标签名创建一个空的vnode dom索引也当做索引传入
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  // 返回一个remove函数  如果这个函数被调用次数等于listeners的时候 这个元素会被删除
  function createRmCb (childElm, listeners) {
    function remove () {
      // 没调用一次就减一 直到减到0
      if (--remove.listeners === 0) {
        // 删除节点
        removeNode(childElm)
      }
    }
    // 把listeners当做一个变量放在remove函数下
    remove.listeners = listeners
    return remove
  }

  // 删除节点
  function removeNode (el) {
    // 获取父节点
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    // 翻译：元素有可能已经被删除了 通过v-html v-text
    // 如果有父节点 就通过父节点把当前节点删除
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  function isUnknownElement (vnode, inVPre) {
    // 没有用 v-pre标识
    // 没有命名空间
    // 全局的配置忽略元素没有匹配到
    // 那么 判断是否是未知标签  \src\platforms\web\util\element.js
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    )
  }

  // 用法 <span v-pre></span>  跳过这个元素和它的子元素的编译过程
  // 标记当前是否是用v-pre不需要编译创建的节点
  // 大于0 表示他的父节点用了 v-pre
  let creatingElmInVPre = 0

  //            vnode,
  //           insertedVnodeQueue,
  //           oldElm._leaveCb ? null : parentElm,
  //           nodeOps.nextSibling(oldElm)

  //children[i], insertedVnodeQueue, vnode.elm, null, true, children, i
  function createElm (
    vnode,
    insertedVnodeQueue,
    parentElm,
    refElm,
    nested,
    ownerArray,
    index
  ) {
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    vnode.isRootInsert = !nested // for transition enter check
    // patch过程中创建组件节点直接返回 非组件没有vnode.data返回undefined
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }

    // vnode data
    const data = vnode.data
    // vnode 子节点
    const children = vnode.children
    // vnode 标签名
    const tag = vnode.tag
    if (isDef(tag)) {
      if (process.env.NODE_ENV !== 'production') {
        // 如果用了v-pre 就把creatingElmInVPre++
        // 用number变量记录是为了递归调用的时候子节点使用 当递归调用完成的时候执行creatingElmInVPre--来还原
        // 子节点判断creatingElmInVPre 为不为0 就能知道他的父节点们有没有被v-pre标识
        if (data && data.pre) {
          creatingElmInVPre++
        }
        // 未知元素 没有被v-pre标识 报警告  有可能是用到了未注册的组件
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' + tag + '> - did you ' +
            'register the component correctly? For recursive components, ' +
            'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }


      // 先创建父节点 再创建子节点，先挂载子节点 再挂载父节点

      // 创建
      // 遍历子节点 递归调用本函数
      // 插入

      // 创建一个真实dom 最外层的
      // 判断vnode有没有命名空间 有命名空间创建带命名空间的节点 没有命名空间创建普通节点
      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode)
      setScope(vnode)

      /* istanbul ignore if */
      if (__WEEX__) {
        // in Weex, the default insertion order is parent-first.
        // List items can be optimized to use children-first insertion
        // with append="tree".
        const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
        if (!appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
        createChildren(vnode, children, insertedVnodeQueue)
        if (appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
      } else {
        // 创建子节点
        createChildren(vnode, children, insertedVnodeQueue)
        if (isDef(data)) {
          // 调用生命周期
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        // 插入到父节点中 参照节点 如果直接对父元素appendChild会添加在最后 如果有refElm就在这个节点之前添加
        // 深度遍历，最深层的先插入，然后执行完递归操作 父节点再插入
        insert(parentElm, vnode.elm, refElm)
      }

      // 递归完成的时候 还原creatingElmInVPre标识
      if (process.env.NODE_ENV !== 'production' && data && data.pre) {
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) {
      // vnode是一个注释节点 就创建一个真实的注释节
      vnode.elm = nodeOps.createComment(vnode.text)
      // dom操作 插入注释节点
      insert(parentElm, vnode.elm, refElm)
    } else {
      // vnode是一个文本节点 就创建一个真实的文本节点
      vnode.elm = nodeOps.createTextNode(vnode.text)
      // dom操作 插入文本节点
      insert(parentElm, vnode.elm, refElm)
    }
  }

  function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data
    // 如果有vnode.data 证明是组件
    if (isDef(i)) {
      // 如果是被keep-alive包裹的组件  会在keep-alive组件的render方法中向data添加keepAlive值为true
      // vnode.componentInstance是子组件的vm
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      // vnode data的生命周期调用 调用 vnode.data.hook.init
      // src/core/vdom/create-component.js componentVNodeHooks init
      if (isDef(i = i.hook) && isDef(i = i.init)) {
        i(vnode, false /* hydrating */)
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      if (isDef(vnode.componentInstance)) {
        // 子组件 真正的插入操作
        initComponent(vnode, insertedVnodeQueue)
        insert(parentElm, vnode.elm, refElm)
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
  }

  function initComponent (vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) {
      insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert)
      vnode.data.pendingInsert = null
    }
    vnode.elm = vnode.componentInstance.$el
    if (isPatchable(vnode)) {
      invokeCreateHooks(vnode, insertedVnodeQueue)
      setScope(vnode)
    } else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      registerRef(vnode)
      // make sure to invoke the insert hook
      insertedVnodeQueue.push(vnode)
    }
  }

  function reactivateComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    let innerNode = vnode
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode
      if (isDef(i = innerNode.data) && isDef(i = i.transition)) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)
        }
        insertedVnodeQueue.push(innerNode)
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm)
  }

  // 插入节点  父节点 要插入的元素  查考节点
  function insert (parent, elm, ref) {
    // 父节点必须有
    if (isDef(parent)) {
      // 有参考节点
      if (isDef(ref)) {
        // 参考节点 和 要插入的节点属于兄弟节点
        if (ref.parentNode === parent) {
          // 就在参考节点之前插入
          nodeOps.insertBefore(parent, elm, ref)
        }
      } else {
        // 没有参考节点 就在父节点之下最后一位插入
        nodeOps.appendChild(parent, elm)
      }
    }
  }

  function createChildren (vnode, children, insertedVnodeQueue) {
    // 如果子节点是一个数组 就遍历数组 创建对象
    if (Array.isArray(children)) {
      if (process.env.NODE_ENV !== 'production') {
        // 检查key是否有重复的 非生产环境下报警告
        checkDuplicateKeys(children)
      }
      // 循环递归创建节点
      for (let i = 0; i < children.length; ++i) {
        // 子节点先执行插入dom  然后父节点再插入  （是不是对游离节点操作 比对已经插入的html操作 减少了一部分回流重绘的性能损耗）
        createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
      }
    } else if (isPrimitive(vnode.text)) {
      // 如果是一个简单数据类型 就直接创建文本节点 并添加
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
    }
  }

  function isPatchable (vnode) {
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag)
  }

  function invokeCreateHooks (vnode, insertedVnodeQueue) {
    // 调用所有模块中create的回调 传入空节点 新节点 因为是创建 所以没有oldVnode
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode)
    }
    // vnode.data的生命周期如果有定义
    i = vnode.data.hook // Reuse variable
    if (isDef(i)) {
      // 定义有vnode.data.hook.create 就调用
      if (isDef(i.create)) i.create(emptyNode, vnode)
      // 如果定义有vnode.data.hook.insert 先放在队列中
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  function setScope (vnode) {
    let i
    if (isDef(i = vnode.fnScopeId)) {
      nodeOps.setStyleScope(vnode.elm, i)
    } else {
      let ancestor = vnode
      while (ancestor) {
        if (isDef(i = ancestor.context) && isDef(i = i.$options._scopeId)) {
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (isDef(i = activeInstance) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef(i = i.$options._scopeId)
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  function addVnodes (parentElm, refElm, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(vnodes[startIdx], insertedVnodeQueue, parentElm, refElm, false, vnodes, startIdx)
    }
  }

  // 调用销毁生命周期
  function invokeDestroyHook (vnode) {
    let i, j
    const data = vnode.data
    // vnode.data有定义
    if (isDef(data)) {
      // vnode.data.hook.destroy有定义就调用一次
      if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode)
      // 模块中所有的destroy回调 遍历调用
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }
    // 如果vnode有children
    if (isDef(i = vnode.children)) {
      // 遍历所有的children 递归调用销毁
      // 先销毁父再销毁子
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  // 从开始索引到结束索引 删除vnode
  function removeVnodes (parentElm, vnodes, startIdx, endIdx) {
    // 从开始索引遍历到结束索引
    for (; startIdx <= endIdx; ++startIdx) {
      // 拿到对应索引的vnode
      const ch = vnodes[startIdx]
      if (isDef(ch)) {
        // 如果是一个非文本非注释的vnode 调用removehook
        if (isDef(ch.tag)) {
          removeAndInvokeRemoveHook(ch)
          invokeDestroyHook(ch)
        } else { // Text node
          // 文本节点 注释节点 直接删除
          removeNode(ch.elm)
        }
      }
    }
  }

  // 函数vnode 并且调用remove生命周期
  // rm是递归调用的时候传入的一个函数
  function removeAndInvokeRemoveHook (vnode, rm) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      // cbs.remove 是各个模块的remove回调
      // 回调个数+1
      const listeners = cbs.remove.length + 1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        // 已经是递归调用的时候 把listeners想加
        rm.listeners += listeners
      } else {
        // directly removing
        // 非递归调用的时候 根据次数 创建一个rm函数
        // rm函数下有listeners 记录次数  每调用一次rm  rm.listeners减一 直到为0 node就被删除
        rm = createRmCb(vnode.elm, listeners)
      }
      // recursively invoke hooks on child component root node
      // 如果vnode.componentInstance._vnode.data有定义则证明是一个子组件的根 递归调用删除
      if (isDef(i = vnode.componentInstance) && isDef(i = i._vnode) && isDef(i.data)) {
        removeAndInvokeRemoveHook(i, rm)
      }
      // 遍历调用所有的remove回调
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm)
      }
      // vnode.data.hook.remove 如果定义了 就调用
      if (isDef(i = vnode.data.hook) && isDef(i = i.remove)) {
        i(vnode, rm)
      } else {
        // 没有定义的时候 就调用rm
        rm()
      }
    } else {
      // 如果没有vnode.data 就直接删除这个vnode的真实dom节点
      removeNode(vnode.elm)
    }
  }

  function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
    let oldStartIdx = 0
    let newStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    const canMove = !removeOnly

    // 非生产环境 多个节点校验key是否相等
    if (process.env.NODE_ENV !== 'production') {
      checkDuplicateKeys(newCh)
    }

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (isUndef(oldStartVnode)) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
        canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
        canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
        if (isUndef(idxInOld)) { // New element
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        } else {
          vnodeToMove = oldCh[idxInOld]
          if (sameVnode(vnodeToMove, newStartVnode)) {
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue)
            oldCh[idxInOld] = undefined
            canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
          } else {
            // same key but different element. treat as new element
            createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }
    if (oldStartIdx > oldEndIdx) {
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
    } else if (newStartIdx > newEndIdx) {
      removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
    }
  }

  // 检查 :key 是否重复
  function checkDuplicateKeys (children) {
    // 已经存在的key集合
    const seenKeys = {}
    // 遍历子节点
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      // 拿到子节点的kye
      const key = vnode.key
      if (isDef(key)) {
        // 从集合中取 如果为true证明之前遍历的时候已经有锅这个key了 就报警告
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          // 如果是第一次就置为true 下次如果有相同的就报警告
          seenKeys[key] = true
        }
      }
    }
  }

  // 从老的children中找到node的索引
  function findIdxInOld (node, oldCh, start, end) {
    // 从开始索引 遍历到结束索引
    for (let i = start; i < end; i++) {
      // 取到当前索引位置的children
      const c = oldCh[i]
      // 如果有定义 和要比较的node是相同的 就返回索引
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  function patchVnode (oldVnode, vnode, insertedVnodeQueue, removeOnly) {
    if (oldVnode === vnode) {
      return
    }

    const elm = vnode.elm = oldVnode.elm

    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    if (isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    let i
    const data = vnode.data
    if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
      i(oldVnode, vnode)
    }

    const oldCh = oldVnode.children
    const ch = vnode.children
    if (isDef(data) && isPatchable(vnode)) {
      // 调用模块中update的回调 传入 oldVnode, vnode
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
    }
    if (isUndef(vnode.text)) {
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {
      nodeOps.setTextContent(elm, vnode.text)
    }
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
    }
  }

  function invokeInsertHook (vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue
    } else {
      for (let i = 0; i < queue.length; ++i) {
        // 调用vnode data的insert生命周期
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  // 本方法只在浏览器端运行 所以我们可以假定 elm都是dom元素
  function hydrate (elm, vnode, insertedVnodeQueue, inVPre) {
    let i
    // 从vnode中取得值
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre)
    vnode.elm = elm

    // 如果是一个异步组件的占位节点 设置一个标记返回true
    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }
    // assert node match
    // 非生产环境下 如果匹配vnode 和 dom元素 不相同 就直接返回false
    if (process.env.NODE_ENV !== 'production') {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    // vnode.data有定义
    if (isDef(data)) {
      // 如果vnode.data.hook.init有定义 就调用一次
      if (isDef(i = data.hook) && isDef(i = i.init)) i(vnode, true /* hydrating */)
      //
      if (isDef(i = vnode.componentInstance)) {
        // child component. it should have hydrated its own tree.
        // vnode是一个组件vnode
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }
    // vnode.tag有定义
    if (isDef(tag)) {
      if (isDef(children)) {
        // vnode有子元素  有标签名
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          // 如果真实dom没有子节点  vnode有子节点 就创建
          createChildren(vnode, children, insertedVnodeQueue)
        } else {
          // v-html and domProps: innerHTML
          if (isDef(i = data) && isDef(i = i.domProps) && isDef(i = i.innerHTML)) {
            // data.domProps.innerHTML 存在
            // vnode的innerHTML 和 真实元素的 innerHTML不相同
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }
          } else {
            // iterate and compare children lists
            // 一个标记看子节点 是否全部匹配 有一个不匹配的就置为false
            let childrenMatch = true
            // 取真实dom的第一个子元素
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              // 递归遍历 有一个不相同的就把标记设置为false
              if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) {
                childrenMatch = false
                break
              }
              // 真实dom的下一个兄弟元素 和 下一个vnode的children进行比较
              childNode = childNode.nextSibling
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            // vnode的children已经遍历完成了 真实dom还有节点
            // 或者 上面遍历过程中有不匹配的 就返回false
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children)
              }
              return false
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false
        // 遍历所有的vnode data  然后判断符合条件的执行create更新属性 监听 类名样式等等
        for (const key in data) {
          // 键只要有一个不是attrs,class,staticClass,staticStyle,key中的
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class'])
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }
    return true
  }

  // 匹配vnode 和 dom元素是否相同
  function assertNodeMatch (node, vnode, inVPre) {
    // 有没有定义tag
    if (isDef(vnode.tag)) {
      // tag如果含有vue-component证明是一个组件的占位节点 返回true
      // 非未知节点 并且 vnode的tag 和 节点的标签名相同 返回true
      return vnode.tag.indexOf('vue-component') === 0 || (
        !isUnknownElement(vnode, inVPre) &&
        vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase())
      )
    } else {
      // 3 文本节点、
      // 8 注释节点
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }

  // __patch__ 就是执行这里
  // 实际返回值 是一个function
  // 在初始化的时候 执行update传入的oldVnode是一个真实dom vnode是一个虚拟dom节点
  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    // 删除的逻辑 不传新的vnode
    if (isUndef(vnode)) {
      // 当没有新节点 只有老节点的时候 就删除操作 直接调用销毁钩子
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false
    const insertedVnodeQueue = []

    if (isUndef(oldVnode)) {
      // 组件vnode
      // empty mount (likely as component), create new root element
      isInitialPatch = true
      // 要渲染的vnode  和 insertedVnodeQueue
      createElm(vnode, insertedVnodeQueue)
    } else {
      // update的时候 oldVnode和vnode 都是Vnode实例
      // 初始化的时候 传入的是真实dom isRealElement是true
      const isRealElement = isDef(oldVnode.nodeType)
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // 非真实dom 更新的新旧节点相同
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly)
      } else {
        // 新旧节点不同的情况
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          // 如果是元素节点 第一次挂载的时候 把SSR_ATTR属性删除 hydrating置为true
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          // 把真实dom转换成vnode 只有标签名 和 真实dom的引用
          // 对传入的oldVnode重新赋值
          oldVnode = emptyNodeAt(oldVnode)
        }

        // replacing existing element
        // .elm 是真实dom的引用 oldElm还是一个真实的dom
        const oldElm = oldVnode.elm
        // 获取到真实dom的父元素
        const parentElm = nodeOps.parentNode(oldElm)

        // create new node
        // 创建一个真实dom 新的节点 挂载再parentElm上
        // 根据父节点 递归所有的子节点 然后全部插入
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        // 创建一个占位符节点
        if (isDef(vnode.parent)) {
          let ancestor = vnode.parent
          const patchable = isPatchable(vnode)
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            ancestor.elm = vnode.elm
            if (patchable) {
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } else {
              registerRef(ancestor)
            }
            ancestor = ancestor.parent
          }
        }

        // destroy old node
        // 删除旧节点
        if (isDef(parentElm)) {
          // 如果真实dom有父元素 就通过父元素把旧节点删除
          removeVnodes(parentElm, [oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          // 旧节点调用销毁
          invokeDestroyHook(oldVnode)
        }
      }
    }

    // 调用生命周期
    // insertedVnodeQueue 在patch过程中vnode被不断的添加进去 子在前父在后
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)

    // 返回的是最外层真实dom的引用
    return vnode.elm
  }
}
