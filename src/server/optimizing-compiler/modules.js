/* @flow */

import {
  RAW,
  // INTERPOLATION,
  EXPRESSION
} from './codegen'

import {
  propsToAttrMap,
  isRenderableAttr
} from 'web/server/util'

import {
  isBooleanAttr,
  isEnumeratedAttr
} from 'web/util/attrs'

import type { StringSegment } from './codegen'
import type { CodegenState } from 'compiler/codegen/index'

type Attr = { name: string; value: string };

const plainStringRE = /^"(?:[^"\\]|\\.)*"$|^'(?:[^'\\]|\\.)*'$/

// let the model AST transform translate v-model into appropriate
// props bindings
export function applyModelTransform (el: ASTElement, state: CodegenState) {
  if (el.directives) {
    for (let i = 0; i < el.directives.length; i++) {
      const dir = el.directives[i]
      // 遍历所有的指令 是 v-model的时候
      if (dir.name === 'model') {
        //
        state.directives.model(el, dir, state.warn)
        // remove value for textarea as its converted to text
        if (el.tag === 'textarea' && el.props) {
          el.props = el.props.filter(p => p.name !== 'value')
        }
        break
      }
    }
  }
}


export function genAttrSegments (
  attrs: Array<Attr>
): Array<StringSegment> {
  // 最终调用的是genAttrSegment
  return attrs.map(({ name, value }) => genAttrSegment(name, value))
}

// 生成prop
export function genDOMPropSegments (
  props: Array<Attr>,
  attrs: ?Array<Attr>
): Array<StringSegment> {
  const segments = []
  props.forEach(({ name, value }) => {
    name = propsToAttrMap[name] || name.toLowerCase()
    if (isRenderableAttr(name) &&
      !(attrs && attrs.some(a => a.name === name))
    ) {
      segments.push(genAttrSegment(name, value))
    }
  })
  return segments
}

// 生成属性
function genAttrSegment (name: string, value: string): StringSegment {
  // 判断属性内容是否是 普通的字符串 而非表达式
  if (plainStringRE.test(value)) {
    // force double quote
    // 强制替换成双引号
    value = value.replace(/^'|'$/g, '"')
    // force enumerated attr to "true"
    // 有值不为 false就设置成true
    if (isEnumeratedAttr(name) && value !== `"false"`) {
      value = `"true"`
    }
    // 拼好结果返回
    return {
      type: RAW,
      value: isBooleanAttr(name)
        ? ` ${name}="${name}"`
        : value === '""'
          ? ` ${name}`
          : ` ${name}="${JSON.parse(value)}"`
    }
  } else {
    // 拼好表达式
    return {
      type: EXPRESSION,
      value: `_ssrAttr(${JSON.stringify(name)},${value})`
    }
  }
}

// 生成类名
export function genClassSegments (
  staticClass: ?string,
  classBinding: ?string
): Array<StringSegment> {
  // 只有静态类名 没有:class
  if (staticClass && !classBinding) {
    // 直接返回对象 class就是取的静态类名
    return [{ type: RAW, value: ` class=${staticClass}` }]
  } else {
    // 拼好表达式
    return [{
      type: EXPRESSION,
      value: `_ssrClass(${staticClass || 'null'},${classBinding || 'null'})`
    }]
  }
}

// 生成样式
export function genStyleSegments (
  staticStyle: ?string,
  parsedStaticStyle: ?string,
  styleBinding: ?string,
  vShowExpression: ?string
): Array<StringSegment> {
  // 有静态的行内样式 没有:style 没有用v-show
  if (staticStyle && !styleBinding && !vShowExpression) {
    // 返回一个对象 值拼好的style
    return [{ type: RAW, value: ` style=${JSON.stringify(staticStyle)}` }]
  } else {
    // 返回value是拼接好的表达式
    return [{
      type: EXPRESSION,
      value: `_ssrStyle(${
        parsedStaticStyle || 'null'
      },${
        styleBinding || 'null'
      }, ${
        vShowExpression
          ? `{ display: (${vShowExpression}) ? '' : 'none' }`
          : 'null'
      })`
    }]
  }
}
