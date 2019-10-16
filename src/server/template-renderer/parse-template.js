/* @flow */

const compile = require('lodash.template')
const compileOptions = {
  escape: /{{([^{][\s\S]+?[^}])}}/g,
  interpolate: /{{{([\s\S]+?)}}}/g
}

export type ParsedTemplate = {
  head: (data: any) => string;
  neck: (data: any) => string;
  tail: (data: any) => string;
};

// 模板转换
export function parseTemplate (
  template: string,
  contentPlaceholder?: string = '<!--vue-ssr-outlet-->'
): ParsedTemplate {
  // 是个对象就不管了 直接返回
  if (typeof template === 'object') {
    return template
  }

  // head的结束索引
  let i = template.indexOf('</head>')
  // <!--vue-ssr-outlet--> 的索引
  const j = template.indexOf(contentPlaceholder)

  // 如果插入标识没有找到 就直接报错
  if (j < 0) {
    throw new Error(`Content placeholder not found in template.`)
  }

  // 没有找到head 就用body的开头替代
  if (i < 0) {
    i = template.indexOf('<body>')
    if (i < 0) {
      i = j
    }
  }

  // 拆分三块 lodash.template为了替换模板中的变量 <%= d.name %>
  return {
    // 开头到head结束
    head: compile(template.slice(0, i), compileOptions),
    // head结束到插入标识
    neck: compile(template.slice(i, j), compileOptions),
    // 插入标识结束到最终末尾
    tail: compile(template.slice(j + contentPlaceholder.length), compileOptions)
  }
}
