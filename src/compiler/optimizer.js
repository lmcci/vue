/* @flow */

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */
export function optimize (root: ?ASTElement, options: CompilerOptions) {
  if (!root) return
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 标记静态节点
  markStatic(root)
  // second pass: mark static roots.
  // 标记静态根
  markStaticRoots(root, false)
}

// 下面这些属性都是静态的
function genStaticKeys (keys: string): Function {
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs' +
    (keys ? ',' + keys : '')
  )
}

function markStatic (node: ASTNode) {
  // 判断AST是否是静态的
  node.static = isStatic(node)
  // 元素ast的时候
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading
    // 组件 并且 不是slot  没有inline-template属性
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      return
    }

    // 递归子节点 标记是否是静态的
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      markStatic(child)
      // 如果有一个子节点是非静态的 当前节点也是非静态的
      if (!child.static) {
        node.static = false
      }
    }

    // 当前节点用 v-if
    if (node.ifConditions) {
      // 就遍历v-if的条件
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        // 如果有一个是非静态的 当前节点也是非静态的
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

function  markStaticRoots (node: ASTNode, isInFor: boolean) {
  if (node.type === 1) {
    if (node.static || node.once) {
      // 标记当前节点 是否在v-for中
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.
    // 当前是静态元素 并且有子节点 就标记为静态根
    // 特殊：如果当前是静态元素只有一个纯文本节点 就标记为非静态根
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    // 递归子元素 添加静态根标记
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

function isStatic (node: ASTNode): boolean {
  // 表达式 是非静态的
  if (node.type === 2) { // expression
    return false
  }
  // 文本  注释 是静态的
  if (node.type === 3) { // text
    return true
  }
  // 全部都满足 是一个静态的
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings   v-bind是非静态的
    !node.if && !node.for && // not v-if or v-for or v-else   if for 是非静态的
    !isBuiltInTag(node.tag) && // not a built-in  内置组件是非静态的 slot,component
    isPlatformReservedTag(node.tag) && // not a component  当前平台保留标签
    !isDirectChildOfTemplateFor(node) &&    //
    Object.keys(node).every(isStaticKey)    // ast的属性 全部都是静态的key
  ))
}

function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  // 循环 一直往上找
  while (node.parent) {
    node = node.parent
    // 父标签不是template的
    if (node.tag !== 'template') {
      return false
    }
    // 有v-for指令的
    if (node.for) {
      return true
    }
  }
  return false
}
