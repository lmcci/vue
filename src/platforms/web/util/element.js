/* @flow */

import { inBrowser } from 'core/util/env'
import { makeMap } from 'shared/util'

// MathML 用来在互联网上书写数学符号和公式的置标语言

// svg和 mathml的命名空间
export const namespaceMap = {
  svg: 'http://www.w3.org/2000/svg',
  math: 'http://www.w3.org/1998/Math/MathML'
}

// 返回一个函数判断当前传入的内容是否是一个html标签
export const isHTMLTag = makeMap(
  'html,body,base,head,link,meta,style,title,' +
  'address,article,aside,footer,header,h1,h2,h3,h4,h5,h6,hgroup,nav,section,' +
  'div,dd,dl,dt,figcaption,figure,picture,hr,img,li,main,ol,p,pre,ul,' +
  'a,b,abbr,bdi,bdo,br,cite,code,data,dfn,em,i,kbd,mark,q,rp,rt,rtc,ruby,' +
  's,samp,small,span,strong,sub,sup,time,u,var,wbr,area,audio,map,track,video,' +
  'embed,object,param,source,canvas,script,noscript,del,ins,' +
  'caption,col,colgroup,table,thead,tbody,td,th,tr,' +
  'button,datalist,fieldset,form,input,label,legend,meter,optgroup,option,' +
  'output,progress,select,textarea,' +
  'details,dialog,menu,menuitem,summary,' +
  'content,element,shadow,template,blockquote,iframe,tfoot'
)

// this map is intentionally selective, only covering SVG elements that may
// contain child elements.
// 返回一个函数 判断传入的参数是否是一个svg标签
export const isSVG = makeMap(
  'svg,animate,circle,clippath,cursor,defs,desc,ellipse,filter,font-face,' +
  'foreignObject,g,glyph,image,line,marker,mask,missing-glyph,path,pattern,' +
  'polygon,polyline,rect,switch,symbol,text,textpath,tspan,use,view',
  true
)

// 判断传入的字符串是否是 "pre"
export const isPreTag = (tag: ?string): boolean => tag === 'pre'

// 判断是否是一个浏览器标签
// html或者svg标签
export const isReservedTag = (tag: string): ?boolean => {
  return isHTMLTag(tag) || isSVG(tag)
}

// 获取传入的标签是svg还是MathML标签
export function getTagNamespace (tag: string): ?string {
  // svg标签集合判断
  if (isSVG(tag)) {
    return 'svg'
  }
  // basic support for MathML
  // note it doesn't support other MathML elements being component roots
  // MathML标签名是'math'
  if (tag === 'math') {
    return 'math'
  }
}

// 未知元素的缓存对象
const unknownElementCache = Object.create(null)
// 判断标签名是否是一个未知的
export function isUnknownElement (tag: string): boolean {
  /* istanbul ignore if */
  // 非浏览器 全是未知标签
  if (!inBrowser) {
    return true
  }
  // 通过标签名判断 是否是一个html/svg标签 如果是就返回不是一个未知标签
  if (isReservedTag(tag)) {
    return false
  }
  // 标签名转小写
  tag = tag.toLowerCase()
  /* istanbul ignore if */
  // 从缓存中取
  if (unknownElementCache[tag] != null) {
    return unknownElementCache[tag]
  }
  // 创建一个游离节点
  const el = document.createElement(tag)
  if (tag.indexOf('-') > -1) {
    // http://stackoverflow.com/a/28210364/1070244
    // 标签包含“-”
    // 判断构造函数 是否和window.HTMLUnknownElement/window.HTMLElement相等 相等就是未知标签 存入缓存中
    return (unknownElementCache[tag] = (
      el.constructor === window.HTMLUnknownElement ||
      el.constructor === window.HTMLElement
    ))
  } else {
    // el转换成string对象 正则判断是否有“HTMLUnknownElement”  存入缓存中
    return (unknownElementCache[tag] = /HTMLUnknownElement/.test(el.toString()))
  }
}

// 返回一个函数 判断当前传入的标签是否是一个输入框类型
export const isTextInputType = makeMap('text,number,password,search,email,tel,url')
