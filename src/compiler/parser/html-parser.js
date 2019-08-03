/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// could use https://www.w3.org/TR/1999/REC-xml-names-19990114/#NT-QName
// but for Vue templates we can enforce a simple charset
const ncname = '[a-zA-Z_][\\w\\-\\.]*'
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

let IS_REGEX_CAPTURING_BROKEN = false
'x'.replace(/x(.)?/g, function (m, g) {
  IS_REGEX_CAPTURING_BROKEN = g === ''
})

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t'
}
const encodedAttr = /&(?:lt|gt|quot|amp);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  // 深度优先遍历 把未闭合的都放在栈中
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0   // 当前解析到html的索引位置
  let last, lastTag   // 上次解析的文本 上次解析的标签

  // 循环处理html
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    // 非script,style,textarea 标签中包裹纯文本的情况
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // Comment:
        // 通过正则判断是否是注释节点
        if (comment.test(html)) {
          // 获取注释节点的结束索引
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            // 是否要保留注释节点
            if (options.shouldKeepComment) {
              // 创建注释节点的ast 4包左不包右 '<--'
              options.comment(html.substring(4, commentEnd))
            }
            // 向前移动 并修改html  3是'-->'的长度
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // <![if | IE]> 这类的注释
        if (conditionalComment.test(html)) {
          // 找到结尾索引
          const conditionalEnd = html.indexOf(']>')

          // 匹配到结尾的时候 直接向前移动 什么都不做
          // 这类东西不需要解析 是给ie浏览器识别的
          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        // 匹配DOCTYPE 直接前进 什么都不做
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        // 匹配结束标签
        const endTagMatch = html.match(endTag)

        if (endTagMatch) {
          // 记录当前索引
          const curIndex = index
          // 前进
          advance(endTagMatch[0].length)
          // 解析结束标签
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        // 匹配开始标签
        // 当前是开始标签返回对象包含 tagName attrs start end unarySlash
        // 不是开始标签 什么都不返回
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          // 处理开始标签
          handleStartTag(startTagMatch)
          // 如果要忽略xxx??  就前进以忽略
          if (shouldIgnoreFirstNewline(lastTag, html)) {
            advance(1)
          }
          continue
        }
      }

      // 处理文本
      let text, rest, next
      // 当查找 html.indexOf('<') >= 0 的时候证明 最开始的不是< 开始标签和结束标签是一起处理的
      // 就只有标签中的文本的情况了
      if (textEnd >= 0) {
        // 下一个<开始到最后的文本
        rest = html.slice(textEnd)
        // 有可能文本中有 < 所以要匹配下一个 结束标签 或者 开始标签 或者 注释 或者 DOCTYPE
        // 结束标签 或者 开始标签 或者 注释 或者 DOCTYPE 的时候结束循环
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          // 找下一个 < 位置 然后截取
          next = rest.indexOf('<', 1)
          // 剩余的没有<了 就不继续循环
          if (next < 0) break
          // 修正 textEnd
          textEnd += next
          rest = html.slice(textEnd)
        }
        // 截取text 然后前进
        text = html.substring(0, textEnd)
        // 前进跳过文本
        advance(textEnd)
      }

      // 上面处理了 === 0    >= 0的情况
      // 如果剩余的html中没有 < 当文本节点处理
      if (textEnd < 0) {
        text = html
        html = ''
      }

      // 创建文本的AST
      if (options.chars && text) {
        // chars回调
        options.chars(text)
      }
    } else {
      // script,style,textarea 这些的处理
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        // 是否要忽略开始空行 text前进一位
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        // 创建文本AST
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`)
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // index相当于一个指针 标识当前处理到html字符串的哪个位置
  // 修改索引 和 html删除
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  // 判断当前解析到的是不是开始标签
  // 返回的是一个对象 有tagName attrs start end unarySlash
  function parseStartTag () {
    // 匹配开始标签  分组后start[1] 是标签名
    const start = html.match(startTagOpen)
    // 匹配到了
    if (start) {
      const match = {
        tagName: start[1],  // 标签名
        attrs: [],          // 属性数组
        start: index        // 当前索引也就是 标签开始索引
      }
      // 前进 过<标签名
      advance(start[0].length)

      // 继续匹配属性   key=value
      // 直到匹配开始标签的结束
      let end, attr
      while (!(end = html.match(startTagClose)) && (attr = html.match(attribute))) {
        // 前进
        advance(attr[0].length)
        // 把匹配到的属性放在attrs 数组中 attr中是match的结果
        match.attrs.push(attr)
      }
      //
      if (end) {
        // 如果自闭标签 会有这个值
        match.unarySlash = end[1]
        // 前进
        advance(end[0].length)
        // 结束索引
        match.end = index
        return match
      }
    }
  }

  // 处理开始标签
  // match 是一个对象 有tagName attrs start end unarySlash
  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      // 所有能放在P标签内的元素 就是Phrasing元素

      // 如果p标签内有 非Phrasing元素  就结束P标签 相当于添加了</p>
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      // 可以只有开始标签没有结束标签的时候 就直接调用结束
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    // 是否是自闭合标签
    // 没有写 /> 的话 自闭和标签可以写 <br> 通过标签名判断
    const unary = isUnaryTag(tagName) || !!unarySlash

    // 遍历属性列表
    // 把正则匹配的结果转换成键值对
    const l = match.attrs.length
    const attrs = new Array(l)

    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      // hackish work around FF bug https://bugzilla.mozilla.org/show_bug.cgi?id=369778
      // 兼容写法 firefox
      if (IS_REGEX_CAPTURING_BROKEN && args[0].indexOf('""') === -1) {
        if (args[3] === '') { delete args[3] }
        if (args[4] === '') { delete args[4] }
        if (args[5] === '') { delete args[5] }
      }
      // 3 4 5 分组是属性值
      const value = args[3] || args[4] || args[5] || ''
      // 转义
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1], // 属性名
        value: decodeAttr(value, shouldDecodeNewlines)  // 解码转义
      }
    }

    if (!unary) {
      // 不是自闭标签 要放在栈中 等待匹配结束标签
      // lowerCasedTag也转小写存入 出栈的时候 通过这个找的
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs })
      // 记录本次的标签名
      lastTag = tagName
    }

    // 创建ast
    if (options.start) {
      // start是回调
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // 解析结束标签
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    // 最开始传入的时候 start结束标签开始索引 和 end结束标签结束索引
    if (start == null) start = index
    if (end == null) end = index

    // 在处理html的时候标签名都是转成小写的
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
    }

    // Find the closest opened tag of the same type
    // 遍历栈，从栈顶开始找 把找到的位置给pos
    if (tagName) {
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack
      // 上面只是找到对应开始标签的索引 没有对栈操作
      // 这里从栈顶开始到上面找到的索引位置遍历
      for (let i = stack.length - 1; i >= pos; i--) {
        // 如果栈顶那一个不是匹配到的 就报警告 没有匹配到标签
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`
          )
        }
        // 生成ast
        if (options.end) {
          // end是传入的回调
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 改变栈的长度 正常情况下算出栈一次  没有匹配上的时候 忽略没有匹配到的标签
      stack.length = pos
      // 记录上次处理的标签名
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') {
      // </br> 处理
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      // 上面特殊处理p标签  这里要在结束的时候 加上<p>
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
