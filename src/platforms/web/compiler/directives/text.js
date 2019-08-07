/* @flow */

import { addProp } from 'compiler/helpers'

// 在ast下添加prop  {name: "textContent", value: `_s(${dir.value})`}
// `_s(${dir.value})` 字符串表达式  _s
export default function text (el: ASTElement, dir: ASTDirective) {
  if (dir.value) {
    addProp(el, 'textContent', `_s(${dir.value})`)
  }
}
