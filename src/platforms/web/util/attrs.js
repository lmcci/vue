/* @flow */

import { makeMap } from 'shared/util'

// these are reserved for web because they are directly compiled away
// during template compilation
// 返回一个函数 判断传入的是否是一个内置的属性   “style” “class”
export const isReservedAttr = makeMap('style,class')

// attributes that should be using props for binding
// 需要是用props绑定的属性？
// 返回一个函数 判断传入的是否是一个接受值类型的属性
const acceptValue = makeMap('input,textarea,option,select,progress')

// 必须要用props?
// <video muted />
// <input checked />
// <option selected />
// <input value type="button" />
export const mustUseProp = (tag: string, type: ?string, attr: string): boolean => {
  return (
    (attr === 'value' && acceptValue(tag)) && type !== 'button' ||
    (attr === 'selected' && tag === 'option') ||
    (attr === 'checked' && tag === 'input') ||
    (attr === 'muted' && tag === 'video')
  )
}

// 返回一个函数 判断传入的参数 是否是一个 可枚举的属性？
export const isEnumeratedAttr = makeMap('contenteditable,draggable,spellcheck')

// 返回一个函数 判断传入的参数 是否是一个值为boolean的属性
export const isBooleanAttr = makeMap(
  'allowfullscreen,async,autofocus,autoplay,checked,compact,controls,declare,' +
  'default,defaultchecked,defaultmuted,defaultselected,defer,disabled,' +
  'enabled,formnovalidate,hidden,indeterminate,inert,ismap,itemscope,loop,multiple,' +
  'muted,nohref,noresize,noshade,novalidate,nowrap,open,pauseonexit,readonly,' +
  'required,reversed,scoped,seamless,selected,sortable,translate,' +
  'truespeed,typemustmatch,visible'
)

// xlink XML链接语言    XML 文档中创建超链接
// xlink命名空间
export const xlinkNS = 'http://www.w3.org/1999/xlink'

// 是否是xlink:开头
export const isXlink = (name: string): boolean => {
  return name.charAt(5) === ':' && name.slice(0, 5) === 'xlink'
}

// 获取xlink属性
// 截取xlink:之后的内容返回  如果不以xlink:开头 就返回空字符串
export const getXlinkProp = (name: string): string => {
  return isXlink(name) ? name.slice(6, name.length) : ''
}

// 判断传入参数是否是一个假值
// null false
export const isFalsyAttrValue = (val: any): boolean => {
  return val == null || val === false
}
