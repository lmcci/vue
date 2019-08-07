/* @flow */

import { dirRE, onRE } from './parser/index'

// these keywords should not appear inside expressions, but operators like
// typeof, instanceof and in are allowed
const prohibitedKeywordRE = new RegExp('\\b' + (
  'do,if,for,let,new,try,var,case,else,with,await,break,catch,class,const,' +
  'super,throw,while,yield,delete,export,import,return,switch,default,' +
  'extends,finally,continue,debugger,function,arguments'
).split(',').join('\\b|\\b') + '\\b')

// these unary operators should not be used as property/method names
const unaryOperatorsRE = new RegExp('\\b' + (
  'delete,typeof,void'
).split(',').join('\\s*\\([^\\)]*\\)|\\b') + '\\s*\\([^\\)]*\\)')

// strip strings in expressions
const stripStringRE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*\$\{|\}(?:[^`\\]|\\.)*`|`(?:[^`\\]|\\.)*`/g

// detect problematic expressions in a template
// 检查ast的错误
export function detectErrors (ast: ?ASTNode): Array<string> {
  const errors: Array<string> = []
  if (ast) {
    checkNode(ast, errors)
  }
  return errors
}

// 检查ast
function checkNode (node: ASTNode, errors: Array<string>) {
  if (node.type === 1) {
    // 元素
    for (const name in node.attrsMap) {
      if (dirRE.test(name)) {
        // v- @ : 的时候
        // 从map中拿到对应的表达式
        const value = node.attrsMap[name]
        if (value) {
          if (name === 'v-for') {
            // v-for
            checkFor(node, `v-for="${value}"`, errors)
          } else if (onRE.test(name)) {
            // @ v-on
            checkEvent(value, `${name}="${value}"`, errors)
          } else {
            // 表达式
            checkExpression(value, `${name}="${value}"`, errors)
          }
        }
      }
    }
    if (node.children) {
      // 深度遍历
      for (let i = 0; i < node.children.length; i++) {
        checkNode(node.children[i], errors)
      }
    }
  } else if (node.type === 2) {
    // 表达式
    checkExpression(node.expression, node.text, errors)
  }
}

function checkEvent (exp: string, text: string, errors: Array<string>) {
  // 对时间的表达式过滤 匹配关键字 delete,typeof,void
  const stipped = exp.replace(stripStringRE, '')
  const keywordMatch: any = stipped.match(unaryOperatorsRE)
  if (keywordMatch && stipped.charAt(keywordMatch.index - 1) !== '$') {
    errors.push(
      `avoid using JavaScript unary operator as property name: ` +
      `"${keywordMatch[0]}" in expression ${text.trim()}`
    )
  }
  // 检查表达式是否合法
  checkExpression(exp, text, errors)
}

function checkFor (node: ASTElement, text: string, errors: Array<string>) {
  // 检查for的表达式是否合法
  checkExpression(node.for || '', text, errors)
  // 检查对应的标识符是否合法  item index key
  checkIdentifier(node.alias, 'v-for alias', text, errors)
  checkIdentifier(node.iterator1, 'v-for iterator', text, errors)
  checkIdentifier(node.iterator2, 'v-for iterator', text, errors)
}

// 通过new Function的方式检查标识符
function checkIdentifier (
  ident: ?string,
  type: string,
  text: string,
  errors: Array<string>
) {
  if (typeof ident === 'string') {
    try {
      new Function(`var ${ident}=_`)
    } catch (e) {
      errors.push(`invalid ${type} "${ident}" in expression: ${text.trim()}`)
    }
  }
}

// 检查表达式
function checkExpression (exp: string, text: string, errors: Array<string>) {
  try {
    // 通过new Function
    new Function(`return ${exp}`)
  } catch (e) {
    // 把error的信息输出 匹配关键字 放在errors的数组中
    const keywordMatch = exp.replace(stripStringRE, '').match(prohibitedKeywordRE)
    if (keywordMatch) {
      errors.push(
        `avoid using JavaScript keyword as property name: ` +
        `"${keywordMatch[0]}"\n  Raw expression: ${text.trim()}`
      )
    } else {
      errors.push(
        `invalid expression: ${e.message} in\n\n` +
        `    ${exp}\n\n` +
        `  Raw expression: ${text.trim()}\n`
      )
    }
  }
}
