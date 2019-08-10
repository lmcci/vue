/* @flow */

import deindent from 'de-indent'
import { parseHTML } from 'compiler/parser/html-parser'
import { makeMap } from 'shared/util'

// 换行符
const splitRE = /\r?\n/g
const replaceRE = /./g

// isSpecialTag函数 判断转换成小写之后是否是特殊处理的标签
const isSpecialTag = makeMap('script,style,template', true)

type Attribute = {
  name: string,
  value: string
};

/**
 * Parse a single-file component (*.vue) file into an SFC Descriptor Object.
 */
// 转换.vue文件  将文本解析成对象
export function parseComponent (
  content: string,
  options?: Object = {}
): SFCDescriptor {
  // 最终返回的是这个对象，一共有这四个字段 解析出来的东西
  // styles customBlocks 会有多个 template script只有一个
  const sfc: SFCDescriptor = {
    template: null,
    script: null,
    styles: [],
    customBlocks: []
  }
  // 记录当前遍历到的标签的深度
  let depth = 0
  // 当前遍历到的标签对象
  let currentBlock: ?SFCBlock = null

  // 开始标签的回调
  function start (
    tag: string,
    attrs: Array<Attribute>,
    unary: boolean,
    start: number,
    end: number
  ) {
    // 第一层的时候
    if (depth === 0) {
      // 定义一个当前遍历到的对象
      currentBlock = {
        type: tag,
        content: '',
        start: end, // 标签内容的开始位置  传入的start是开始标签的开始位置 end是开始标签的结束位置
        // 传入的attrs是一个数组 [{"name": attrName, "value": attrValue}, {}, {}]
        // 转换成{attrName1:attrValue1, attrName2: attrValue2}
        attrs: attrs.reduce((cumulated, { name, value }) => {
          cumulated[name] = value || true
          return cumulated
        }, {})
      }
      // script,style,template 标签是要特殊处理的
      if (isSpecialTag(tag)) {
        // 检查属性  这里的attrs还是传入的attrs 没有通过reduce改变的
        // 符合条件的会在currentBlock下添加属性
        checkAttrs(currentBlock, attrs)
        // style标签要放进styles数组中
        if (tag === 'style') {
          sfc.styles.push(currentBlock)
        } else {
          // 根据标签名 直接放在sfc中 sfc.script = {}
          sfc[tag] = currentBlock
        }
      } else { // custom blocks
        // 不是特殊处理的标签 就放在自定义的数组中
        sfc.customBlocks.push(currentBlock)
      }
    }
    // 到开始标签如果不是第一层 也不是自闭合标签就把深度加1
    if (!unary) {
      depth++
    }
  }

  // 检查attrs数组 符合条件的 在block下添加属性
  // script,style,template才会执行
  function checkAttrs (block: SFCBlock, attrs: Array<Attribute>) {
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i]
      if (attr.name === 'lang') {
        block.lang = attr.value
      }
      if (attr.name === 'scoped') {
        block.scoped = true
      }
      if (attr.name === 'module') {
        block.module = attr.value || true
      }
      if (attr.name === 'src') {
        block.src = attr.value
      }
    }
  }

  // 结束标签的回调 会走这里
  function end (tag: string, start: number, end: number) {
    // depth===1 也相当于是第一层
    if (depth === 1 && currentBlock) {
      // 也是记录内容的结束位置  所以把结束标签的开始位置赋值给他
      currentBlock.end = start
      // 开始位置和结束位置 截取出中间的所有内容
      // de-indent除去代码的缩进
      let text = deindent(content.slice(currentBlock.start, currentBlock.end))
      // pad content so that linters and pre-processors can output correct
      // line numbers in errors and warnings
      // 标签名不是template  也在选项中设置了pad
      // 最终在text前面拼接一些换行或者空格
      // 报错信息相关 行数能够对应上
      if (currentBlock.type !== 'template' && options.pad) {
        text = padContent(currentBlock, options.pad) + text
      }
      // 把内容 赋值给currentBlock下面的属性记录
      currentBlock.content = text
      // 在sfc中已经有记录了， 这里才把currentBlock的引用删除
      currentBlock = null
    }
    // 结束标签的时候把深度-1
    depth--
  }

  // 根据要添加的内容 返回空格或者换行
  function padContent (block: SFCBlock, pad: true | "line" | "space") {
    if (pad === 'space') {
      // 开始标签替换 每个字符全替换成空格
      return content.slice(0, block.start).replace(replaceRE, ' ')
    } else {
      // 根据换行符截取获得 一共几行
      const offset = content.slice(0, block.start).split(splitRE).length
      // script没有指定lang  默认type/javascript  //\n  \n
      const padChar = block.type === 'script' && !block.lang
        ? '//\n'
        : '\n'
      // 直接返回几个换行
      return Array(offset).join(padChar)
    }
  }

  // 最终会调用 parseHTML来遍历字符串    start和end 是遍历在标签开始 标签结束的时候的回调
  parseHTML(content, {
    start,
    end
  })

  // 最终把拼装好的数据返回
  return sfc
}
