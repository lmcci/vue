/* @flow */

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

export function parseText (
  text: string,
  delimiters?: [string, string]
): TextParseResult | void {
  // 默认是 {{}} 有传入的用传入的
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  // 如果通过正则在传入的字符串中找不到 就直接返回
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  const rawTokens = []
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  // 循环执行 直到剩余的匹配不成功
  while ((match = tagRE.exec(text))) {
    // 匹配到的位置
    index = match.index
    // push text token
    // 非插值
    if (index > lastIndex) {
      // 非差值的字符串 截取出来放在 rawTokens  tokens中
      rawTokens.push(tokenValue = text.slice(lastIndex, index))
      tokens.push(JSON.stringify(tokenValue))
    }
    // tag token
    // 插值中有filter的时候 生成函数调用的字符串表达式
    const exp = parseFilters(match[1].trim())
    // 把表达式的内容当成函数
    tokens.push(`_s(${exp})`)
    rawTokens.push({ '@binding': exp })
    // 记录一次本次循环的位置
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    expression: tokens.join('+'),   // 匹配到{{abc}} 拼成字符串 _s(abc)  其他都是原样的字符串  最终用+拼接好的字符串
    tokens: rawTokens // 匹配到{{abc}} 的就放{'@binding': 'abc'} 其他的是原样的字符串  最终都放在这个数组中
  }
}
