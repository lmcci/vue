/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

// 输出错误信息
export function baseWarn (msg: string) {
  console.error(`[Vue compiler]: ${msg}`)
}

// 取出modules里面所有的对应key的值 组成数组 然后过滤为空的 再返回
export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}

// 给ast添加props数组
// 把name, value 组成对象添加到props数组中
export function addProp (el: ASTElement, name: string, value: string) {
  (el.props || (el.props = [])).push({ name, value })
  // 设置标记
  el.plain = false
}

// 和上面类似
// 给ast对象添加attrs数组
// 把name, value 组成对象添加到attrs数组中
export function addAttr (el: ASTElement, name: string, value: any) {
  (el.attrs || (el.attrs = [])).push({ name, value })
  el.plain = false
}

// add a raw attr (use this in preTransforms)
// 原始的attr
export function addRawAttr (el: ASTElement, name: string, value: any) {
  // 先存到ast的attrsMap中 可以直接从map中通过name取
  el.attrsMap[name] = value
  // 然后再添加到attrsList
  el.attrsList.push({ name, value })
}

// 和上面类似 添加的对象内容更丰富
export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  modifiers: ?ASTModifiers
) {
  // 把传入的对象添加到el的directives数组中
  (el.directives || (el.directives = [])).push({ name, rawName, value, arg, modifiers })
  el.plain = false
}

// 添加事件
export function addHandler (
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: Function
) {
  // 传入的修饰符 有默认为空对象
  modifiers = modifiers || emptyObject
  // warn prevent and passive modifier
  /* istanbul ignore if */
  // 同时使用了 prevent passive报警告
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.'
    )
  }

  // 给每个修饰符打不同的标记
  // ! capture
  // ~ once
  // & passive
  // check capture modifier
  if (modifiers.capture) {
    delete modifiers.capture
    name = '!' + name // mark the event as captured
  }
  if (modifiers.once) {
    delete modifiers.once
    name = '~' + name // mark the event as once
  }
  /* istanbul ignore if */
  if (modifiers.passive) {
    delete modifiers.passive
    name = '&' + name // mark the event as passive
  }

  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  // 点击事件
  // click.right  click.middle  区分右键和中键
  if (name === 'click') {
    if (modifiers.right) {
      name = 'contextmenu'
      delete modifiers.right
    } else if (modifiers.middle) {
      name = 'mouseup'
    }
  }

  // 是否有用.native修饰
  let events
  if (modifiers.native) {
    delete modifiers.native
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    events = el.events || (el.events = {})
  }

  // 构造一个对象 只有一个键 value 值是传入的value就是attrsList中对应的值 字符串的表达式
  const newHandler: any = {
    value: value.trim()
  }

  // 在前面有通过delete删除键值 如果还是不为空 就把剩余的键值付给newHandler.modifiers
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers
  }

  const handlers = events[name]
  /* istanbul ignore if */
  if (Array.isArray(handlers)) {
    // 如果之前已经有绑定了多个 就是数组
    // 根据important 判断添加在最前面 还是添加在后面
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) {
    // 以前已经绑定过了 还要绑定 就组成一个数组返回
    // 数组顺序不同 执行顺序也不同
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else {
    // 第一次就把 newHandler赋值给events
    events[name] = newHandler
  }

  // 添加一个标记
  el.plain = false
}

// 获得具体的属性内容
export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean
): ?string {
  // 获取值 是不是通过动态绑定的 两种写法 :abc  v-bind:abc
  // 只是获取 不会删除
  const dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name)
  if (dynamicValue != null) {
    // 动态计算? 返回一个表达式
    return parseFilters(dynamicValue)
  } else if (getStatic !== false) {
    // 获得具体的值 然后转成string返回
    // 没有通过:name 这样设置的 有可能内容不需要是响应式的 写死的
    const staticValue = getAndRemoveAttr(el, name)
    if (staticValue != null) {
      // 获得之后直接返回
      return JSON.stringify(staticValue)
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.
// removeFromMap是否需要从map中删除对应的内容
// 通过addRawAttr添加的 未处理过的数据
export function getAndRemoveAttr (
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  let val
  // 从attrsMap中获取值 并且返回
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    // 遍历之后从attrsList删除对应的值
    for (let i = 0, l = list.length; i < l; i++) {
      // name相同就找到了
      if (list[i].name === name) {
        list.splice(i, 1)
        break
      }
    }
  }
  // 如果指定了从attrsMap对象中删除
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  return val
}
