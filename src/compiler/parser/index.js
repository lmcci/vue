/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  pluckModuleFunction
} from '../helpers'
import klass from "../../platforms/web/compiler/modules/class";
import style from "../../platforms/web/compiler/modules/style";
import model from "../../platforms/web/compiler/modules/model";

export const onRE = /^@|^v-on:/
export const dirRE = /^v-|^@|^:/
export const forAliasRE = /([^]*?)\s+(?:in|of)\s+([^]*)/
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g

const argRE = /:(.*)$/
export const bindRE = /^:|^v-bind:/
const modifierRE = /\.[^.]+/g

const decodeHTMLCached = cached(he.decode)

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace

type Attr = { name: string; value: string };

// 创建一个ast对象
export function createASTElement (
  tag: string,  // 标签名
  attrs: Array<Attr>,  // 属性数组
  parent: ASTElement | void  // 父节点 ast
): ASTElement {
  return {
    type: 1,  // 1标示普通元素的ast节点
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),  // 生成代码的时候使用 把所有的attr数组遍历 放在一个对象里面 方便查找
    parent,
    children: []  // 子节点创建的时候为空
  }
}

/**
 * Convert HTML string to AST.
 */
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  // 解析配置
  // 优先取options中的  没有就使用默认的
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no

  // klass, style, model 中定义的这些个方法
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  let root
  let currentParent
  let inVPre = false
  let inPre = false
  let warned = false

  // 调用多次 会控制只调用一次warn
  function warnOnce (msg) {
    if (!warned) {
      warned = true
      warn(msg)
    }
  }

  // 闭合标签
  function closeElement (element) {
    // check pre state
    if (element.pre) {
      // 恢复inVPre 开始标签的时候 之前设置过
      inVPre = false
    }
    // 恢复inVPre 开始标签的时候 之前设置过 有相同的判断
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    // 调用postTransforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  // 调用 parseHTML  传入配置 和回调
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    // 创建开始标签的AST回调
    // 标签 属性 是否是自闭合
    start (tag, attrs, unary) {
      // check namespace.
      // inherit parent ns if there is one
      // 第一次进入的时候 根节点没有parent
      // 树状结构 当前节点只有一个父节点 currentParent
      // ns命名空间
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      // 创建ast元素
      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      if (ns) {
        element.ns = ns
      }

      // 如果是一个 script style 有type='text/javascript'的标签   并且 不是服务端渲染的 时候 报警告
      if (isForbiddenTag(element) && !isServerRendering()) {
        // 设置一个标记
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.'
        )
      }

      // apply pre-transforms
      // 预处理函数调用
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      // 丰富ast对象 根据不同的属性 往ast上添加
      // v-pre
      if (!inVPre) {
        processPre(element)
        if (element.pre) {
          // 局部变量 当遍历下面的子节点都可以取这个值 是否被v-pre包裹
          inVPre = true
        }
      }
      // 通过标签名判断
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        // 处理 v-for
        processFor(element)

        // 处理 v-if
        processIf(element)

        // 处理 v-once
        processOnce(element)
        // element-scope stuff

        // 除了上面处理过的 剩余其他属性的处理 key ref click 等
        processElement(element, options)
      }

      // 根节点检查 不能是slot template 不能有v-for属性
      function checkRootConstraints (el) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.tag === 'slot' || el.tag === 'template') {
            warnOnce(
              `Cannot use <${el.tag}> as component root element because it may ` +
              'contain multiple nodes.'
            )
          }
          if (el.attrsMap.hasOwnProperty('v-for')) {
            warnOnce(
              'Cannot use v-for on stateful component root element because ' +
              'it renders multiple elements.'
            )
          }
        }
      }

      // tree management
      // ast树的管理
      if (!root) {
        // 第一次进入的时候 就把这个元素当成根节点
        root = element
        // 根节点 不能是slot template 不能有v-for属性
        checkRootConstraints(root)
      } else if (!stack.length) {
        // allow root elements with v-if, v-else-if and v-else
        // 如果有多个根节点的时候 除非使用 v-if v-else-if v-else 否则报错
        if (root.if && (element.elseif || element.else)) {
          // 检查
          checkRootConstraints(element)
          // 添加if的条件
          addIfCondition(root, {
            exp: element.elseif,
            block: element
          })
        } else if (process.env.NODE_ENV !== 'production') {
          warnOnce(
            `Component template should contain exactly one root element. ` +
            `If you are using v-if on multiple elements, ` +
            `use v-else-if to chain them instead.`
          )
        }
      }
      // 非根节点 并且当前元素不是 style script
      if (currentParent && !element.forbidden) {
        if (element.elseif || element.else) {
          // 处理if
          processIfConditions(element, currentParent)
        } else if (element.slotScope) { // scoped slot
          // slot的时候添加属性
          currentParent.plain = false
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        } else {
          // 建立父子关系
          // 把当前元素放入父元素的children数组中
          currentParent.children.push(element)
          // 子元素的parent指向父元素
          element.parent = currentParent
        }
      }
      if (!unary) {
        // 如果是非自闭合标签 就把当前节当作父节点 继续遍历后续的子节点
        currentParent = element
        // 入栈 等到解析结束标签的时候再出栈
        stack.push(element)
      } else {
        // 如果是自闭合标签 就结束
        closeElement(element)
      }
    },

    // 创建结束标签的AST回调
    end () {
      // remove trailing whitespace
      // 从栈顶取出一个元素
      const element = stack[stack.length - 1]
      // 获取栈顶元素的最后一个子元素
      const lastNode = element.children[element.children.length - 1]
      // 文本处理
      if (lastNode && lastNode.type === 3 && lastNode.text === ' ' && !inPre) {
        element.children.pop()
      }
      // pop stack
      // 改变数组长度-1  相当于出栈
      stack.length -= 1
      // 改变currentParent
      currentParent = stack[stack.length - 1]
      closeElement(element)
    },

    // 创建文本的AST回调
    chars (text: string) {
      // 没有父节点的时候 就是根节点
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          // 当前模版就只是一个文本
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.'
            )
          } else if ((text = text.trim())) {
            // 定于在根节点之外
            warnOnce(
              `text "${text}" outside root element will be ignored.`
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      // textarea下面的文本节点 是placeholder啥也不做
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }

      // 建立父子关系
      const children = currentParent.children

      //
      text = inPre || text.trim()
        ? isTextTag(currentParent) ? text : decodeHTMLCached(text)
        // only preserve whitespace if its not right after a starting tag
        : preserveWhitespace && children.length ? ' ' : ''


      if (text) {
        let res
        // 处理文本插值 然后建立父子关系
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          children.push({
            type: 2,  // 表达式的ast
            expression: res.expression,
            tokens: res.tokens,
            text
          })
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          children.push({
            type: 3,  // 纯文本的ast
            text
          })
        }
      }
    },

    // 创建注释的AST回调
    comment (text: string) {
      // 直接往children中添加注释对象
      currentParent.children.push({
        type: 3,  // 纯文本的ast
        text,
        isComment: true  // 标记为注释节点
      })
    }
  })
  return root
}

// 处理v-pre
function processPre (el) {
  // 获取到之后 只对ast设置一个pre标记
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

// 处理原始的attrs
// 遍历ast.attrsList 添加到ast.attrs上
function processRawAttrs (el) {
  const l = el.attrsList.length
  if (l) {
    const attrs = el.attrs = new Array(l)
    // 往ast下面添加一个attrs数组
    // 遍历添加
    for (let i = 0; i < l; i++) {
      attrs[i] = {
        name: el.attrsList[i].name,
        value: JSON.stringify(el.attrsList[i].value)
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

// 处理ast
export function processElement (element: ASTElement, options: CompilerOptions) {
  // 处理 :key属性
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  // 没有key 没有属性 认为是一个简单的ast对象
  element.plain = !element.key && !element.attrsList.length

  // 处理 :ref
  processRef(element)
  // 处理slot
  processSlot(element)
  // 处理 :is  inline-template
  processComponent(element)

  // 对应平台的 转换回调
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  // 处理 其他属性
  processAttrs(element)
}

// 处理 :key
function processKey (el) {
  // 获得表达式 放在ast的key属性下面
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (process.env.NODE_ENV !== 'production' && el.tag === 'template') {
      warn(`<template> cannot be keyed. Place the key on real elements instead.`)
    }
    el.key = exp
  }
}

// 处理ref
function processRef (el) {
  // 获得:ref的表达式
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    // 是否在外面有被v-for包裹
    el.refInFor = checkInFor(el)
  }
}

// 处理for
export function processFor (el: ASTElement) {
  let exp
  // 获取到 v-for的值
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    // 把v-for的值转换
    const res = parseFor(exp)
    // res是一个对象 扩展到ast上
    // v-for="(item, index, key) in list"
    // {for: 'list', alias: 'item', iterator1: 'index', iterator2: 'key'}
    if (res) {
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

// 转换for的表达式成一个对象
export function parseFor (exp: string): ?ForParseResult {
  // 是否符合 v-for的语法格式 (item, index) in list
  const inMatch = exp.match(forAliasRE)
  // 通过正则没有匹配到 v-for的表达式非法
  if (!inMatch) return
  const res = {}

  // inMatch[2] 是要循环的数据  list
  res.for = inMatch[2].trim()
  // inMatch[1] 就是 (item, index)  然后替换括号    item, index
  const alias = inMatch[1].trim().replace(stripParensRE, '')

  // 获取每一个变量
  const iteratorMatch = alias.match(forIteratorRE)
  if (iteratorMatch) {
    // alias 就是 item
    res.alias = alias.replace(forIteratorRE, '')
    // iterator1 就是 index
    res.iterator1 = iteratorMatch[1].trim()
    if (iteratorMatch[2]) {
      // iterator2 括号中可以有三个 指定key
      res.iterator2 = iteratorMatch[2].trim()
    }
  } else {
    // 没有用逗号分割的时候 只指定了item
    res.alias = alias
  }
  return res
}

function processIf (el) {
  // 获取v-if的值
  const exp = getAndRemoveAttr(el, 'v-if')
  // v-if的条件表达式
  if (exp) {
    // 把ast对象 的if属性 指向v-if表达式
    el.if = exp
    // 条件添加到ast上
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    // 如果是v-else 就设置一个标记
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    // 如果是-else-if 就把条件放在ast元素的elseif属性下
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

// 处理 v-if的条件
function processIfConditions (el, parent) {
  // 传入的是所有的children 找到最后一个元素ast
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    // 往prev上添加条件数组
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    // 没找到最后一个元素 或者最后一个元素没有if 就报警告
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`
    )
  }
}

// 找到最后一个元素ast type === 1
function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  // 倒着遍历children
  while (i--) {
    // 直到找到其中一个普通的节点
    if (children[i].type === 1) {
      return children[i]
    } else {
      // 排除空格 再有元素 就报警告
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`
        )
      }
      // 直接删除了
      children.pop()
    }
  }
}

// 把条件表达式字符串 放在ast对象下的ifConditions数组中
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  // 没有默认添加个空数组  条件可能有多个
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

// 处理v-once
function processOnce (el) {
  // 获取之后对ast对象添加一个标记
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// 处理slot
function processSlot (el) {
  // 命名插槽  <slot :name="name">
  if (el.tag === 'slot') {
    // 获得插槽的名称 放在AST对象上
    el.slotName = getBindingAttr(el, 'name')
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`
      )
    }
  } else {
    let slotScope
    if (el.tag === 'template') {
      // <template scope="abc" slot-scope="abc">
      // 老版本使用的scope 如果有用到就报警告
      // scope slot-scope是指同一个东西
      slotScope = getAndRemoveAttr(el, 'scope')
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && slotScope) {
        warn(
          `the "scope" attribute for scoped slots have been deprecated and ` +
          `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
          `can also be used on plain elements in addition to <template> to ` +
          `denote scoped slots.`,
          true
        )
      }
      // 拿到slot-scope  放在AST下
      el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
    } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
      /* istanbul ignore if */
      // tag是其他值
      // 同时使用了 v-for slot-scope 报警告
      // v-for takes higher priority v-for优先级更高
      if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
        warn(
          `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
          `(v-for takes higher priority). Use a wrapper <template> for the ` +
          `scoped slot to make it clearer.`,
          true
        )
      }
      // 拿到slot-scope  放在AST下
      el.slotScope = slotScope
    }
    // 获得slot的内容
    const slotTarget = getBindingAttr(el, 'slot')
    if (slotTarget) {
      // 赋值个AST   如果slot是空字符串 就赋值个default
      el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
      // preserve slot as an attribute for native shadow DOM compat
      // only for non-scoped slots.
      // 不是template标签 并且没有用slotScope作用于插槽
      // 就给AST添加attrs slot属性和值  {name: 'slot': value: slotTarget}
      if (el.tag !== 'template' && !el.slotScope) {
        addAttr(el, 'slot', slotTarget)
      }
    }
  }
}

// 处理组件
function processComponent (el) {
  let binding
  // <component :is="componentName" 这种情况的时候
  // 拿到返回的表达式 赋值给ast的component属性
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  // 获得inline-template属性 如果有就在ast上添加标记 inlineTemplate
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

// 处理属性
function processAttrs (el) {
  // 遍历attrsList 中的每个属性
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, isProp
  for (i = 0, l = list.length; i < l; i++) {
    // 获得属性的键
    name = rawName = list[i].name
    value = list[i].value
    // 是否匹配 v-  @   :
    if (dirRE.test(name)) {
      // mark element as dynamic
      // 设置标记为动态绑定的
      el.hasBindings = true
      // modifiers
      // 获得修饰符 .stop  .native  .sync  最终会转换成衡对象
      modifiers = parseModifiers(name)

      // 如果有修饰符 就在name中替换掉
      if (modifiers) {
        // name 过滤掉 修饰符的.
        name = name.replace(modifierRE, '')
      }

      // 正则匹配 事件名之前的内容
      if (bindRE.test(name)) { // v-bind
        // 过滤 : v-bind: 获得真正的name
        name = name.replace(bindRE, '')
        // 转换成表达式
        value = parseFilters(value)
        isProp = false
        //
        if (modifiers) {
          if (modifiers.prop) {
            // 修饰符指定prop
            isProp = true
            // name 中划线转驼峰
            name = camelize(name)
            // innerHTML不是驼峰
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            addHandler(
              el,
              `update:${camelize(name)}`,
              genAssignmentCode(value, `$event`)
            )
          }
        }
        // 添加到prop 或者attr
        // 修饰符制定了prop 或者当前平台对这个属性必须要使用prop
        if (isProp || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value)
        } else {
          addAttr(el, name, value)
        }
      } else if (onRE.test(name)) { // v-on
        // 替换已经匹配的内容  name  "click"
        name = name.replace(onRE, '')
        // el ast对象   name "click"   value attrsList的值   modifiers 之前匹配到的修饰符
        addHandler(el, name, value, modifiers, false, warn)
      } else { // normal directives
        // 去掉 v- @ : 获得真正name
        name = name.replace(dirRE, '')
        // parse arg
        // 匹配 abc:def:ghi
        const argMatch = name.match(argRE)
        const arg = argMatch && argMatch[1]
        // 最终name只截取到abc
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
        }
        // 给ast对象添加directives属性
        addDirective(el, name, rawName, value, arg, modifiers)

        // 对v-model多一次校验
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // 普通的属性 静态不需要响应式的
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.'
          )
        }
      }
      // 添加属性
      addAttr(el, name, JSON.stringify(value))
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      // 设置prop  浏览器兼容问题
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true')
      }
    }
  }
}

// 判断当前的ast父级是不是带有for的
// 就是判断当前的是不是for的子项
function checkInFor (el: ASTElement): boolean {
  let parent = el
  // 直到找到跟节点
  while (parent) {
    // 有for的就返回true
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

// 正则匹配.  转换成对象返回
// 匹配修饰符
function parseModifiers (name: string): Object | void {
  // 就匹配.
  const match = name.match(modifierRE)
  if (match) {
    // 遍历所有匹配到的 除去. 把修饰符当成键 值为true组成对象返回
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

// 把对象数组转换成一个对象
function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  // 遍历所有的attrs
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      // 有重复的name报警告  ie下除外
      warn('duplicate attribute: ' + attrs[i].name)
    }
    // 把name当成键 value当成值  添加到对象中
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
// 判断ast是否是个文本节点 script style当做文本处理
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

// 是否是一个不可用的标签
function isForbiddenTag (el): boolean {
  return (
    // style 标签
    // script 标签 没有指定type默认是text/javascript  指定了text/javascript type可能是module等等
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
// 兼容问题
function guardIESVGBug (attrs) {
  const res = []
  // 遍历所有的attrs
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    // 判断属性名 xmlns:NS数字 开头
    if (!ieNSBug.test(attr.name)) {
      // 在name中删除 NS数字
      attr.name = attr.name.replace(ieNSPrefix, '')
      // 当前attr项添加到结果数组中
      res.push(attr)
    }
  }
  return res
}

// 向上遍历直到根 检测对应的alias
function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    // v-for一起使用有警告
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`
      )
    }
    // 向上遍历 继续检查
    _el = _el.parent
  }
}
