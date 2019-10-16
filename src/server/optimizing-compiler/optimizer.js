/* @flow */

/**
 * In SSR, the vdom tree is generated only once and never patched, so
 * we can optimize most element / trees into plain string render functions.
 * The SSR optimizer walks the AST tree to detect optimizable elements and trees.
 *
 * The criteria for SSR optimizability is quite a bit looser than static tree
 * detection (which is designed for client re-render). In SSR we bail only for
 * components/slots/custom directives.
 */

import { no, makeMap, isBuiltInTag } from 'shared/util'

// 常量标记
// optimizability constants
export const optimizability = {
  // 树 全部没有优化
  FALSE: 0,    // whole sub tree un-optimizable
  // 树 全部优化
  FULL: 1,     // whole sub tree optimizable
  // 本身已经优化了 有一些子节点未优化
  SELF: 2,     // self optimizable but has some un-optimizable children
  // 本身没有优化 子节点全部优化了
  CHILDREN: 3, // self un-optimizable but have fully optimizable children
  // 本身没有优化 子节点有部分未优化了
  PARTIAL: 4   // self un-optimizable with some un-optimizable children
}

let isPlatformReservedTag

export function optimize (root: ?ASTElement, options: CompilerOptions) {
  // 非跟节点 直接返回
  if (!root) return
  // 一个函数判断是否是平台保留标签
  isPlatformReservedTag = options.isReservedTag || no
  // 调用walk方法
  walk(root, true)
}

function walk (node: ASTNode, isRoot?: boolean) {
  // 判断节点是否是未优化的  打个标记
  if (isUnOptimizableTree(node)) {
    node.ssrOptimizability = optimizability.FALSE
    return
  }
  // root node or nodes with custom directives should always be a VNode
  // 是根节点   有自定义指令
  const selfUnoptimizable = isRoot || hasCustomDirective(node)

  // 调用的时候传入节点 再做标记
  const check = child => {
    // 传入节点不是已经全部优化的
    if (child.ssrOptimizability !== optimizability.FULL) {
      // 根节点 或者 带自定义指令的  标记为  本身没有优化 子节点有部分未优化了
      // 其他节点标记为本身已经优化 子节点部分未优化
      node.ssrOptimizability = selfUnoptimizable
        ? optimizability.PARTIAL
        : optimizability.SELF
    }
  }
  // 根节点 或者 带自定义指令的   先标记为本身没有优化 子节点全部优化了
  if (selfUnoptimizable) {
    node.ssrOptimizability = optimizability.CHILDREN
  }
  if (node.type === 1) {
    // 遍历所有子节点
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      // 递归优化子节点
      walk(child)
      // 重新设置标记
      check(child)
    }
    // 有v-if的
    if (node.ifConditions) {
      // v-if所有的条件
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        // 重新做标记
        const block = node.ifConditions[i].block
        walk(block, isRoot)
        check(block)
      }
    }
    // 非根节点 或者 没有带自定义指令的 或者  带v-html v-text的非根节点
    if (node.ssrOptimizability == null ||
      (!isRoot && (node.attrsMap['v-html'] || node.attrsMap['v-text']))
    ) {
      // 标记为全部优化
      node.ssrOptimizability = optimizability.FULL
    } else {
      // 优化兄弟节点
      node.children = optimizeSiblings(node)
    }
  } else {
    // 非元素节点 直接标记为 全部优化
    node.ssrOptimizability = optimizability.FULL
  }
}

// 优化兄弟节点
function optimizeSiblings (el) {
  const children = el.children
  // 已经优化好的节点
  const optimizedChildren = []

  // 当前可以优化的
  let currentOptimizableGroup = []
  // 调用的时候 把上面数组的东西全部添加到已经优化的数组中
  const pushGroup = () => {
    if (currentOptimizableGroup.length) {
      optimizedChildren.push({
        type: 1,
        parent: el,
        tag: 'template',
        attrsList: [],
        attrsMap: {},
        children: currentOptimizableGroup,
        ssrOptimizability: optimizability.FULL
      })
    }
    currentOptimizableGroup = []
  }

  // 遍历子节点
  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    // 先检查标记
    if (c.ssrOptimizability === optimizability.FULL) {
      currentOptimizableGroup.push(c)
    } else {
      // wrap fully-optimizable adjacent siblings inside a template tag
      // so that they can be optimized into a single ssrNode by codegen
      pushGroup()
      optimizedChildren.push(c)
    }
  }
  pushGroup()
  return optimizedChildren
}

function isUnOptimizableTree (node: ASTNode): boolean {
  // 如果本身就是文本节点 或者 表达式 直接返回false  不能再优化了
  if (node.type === 2 || node.type === 3) { // text or expression
    return false
  }
  return (
    // 内置标签
    isBuiltInTag(node.tag) || // built-in (slot, component)
    //  非平台保留表情
    !isPlatformReservedTag(node.tag) || // custom component
    //  <component>
    !!node.component || // "is" component
    //  select标签带有v-model
    isSelectWithModel(node) // <select v-model> requires runtime inspection
  )
}

// 内置指令
const isBuiltInDir = makeMap('text,html,show,on,bind,model,pre,cloak,once')

// 判断是否有自定义指令
function hasCustomDirective (node: ASTNode): ?boolean {
  // 元素节点 并且有自定义指令 不在内置指令里面的
  return (
    node.type === 1 &&
    node.directives &&
    node.directives.some(d => !isBuiltInDir(d.name))
  )
}

// <select v-model> cannot be optimized because it requires a runtime check
// to determine proper selected option
// 带有v-model 的 select
function isSelectWithModel (node: ASTNode): boolean {
  return (
    node.type === 1 &&
    node.tag === 'select' &&
    node.directives != null &&
    node.directives.some(d => d.name === 'model')
  )
}
