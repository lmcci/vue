/* @flow */

import config from '../config'
import { noop } from 'shared/util'

// 警告
export let warn = noop
// 提示
export let tip = noop
// 生成组件的调用栈
export let generateComponentTrace = (noop: any) // work around flow check
// 组件名序列化
export let formatComponentName = (noop: any)

// 非生产模式 给上面的warn tip赋值 否则是一个空函数
if (process.env.NODE_ENV !== 'production') {
  // 是否能打log
  const hasConsole = typeof console !== 'undefined'
  //
  const classifyRE = /(?:^|[-_])(\w)/g
  const classify = str => str
    .replace(classifyRE, c => c.toUpperCase())
    .replace(/[-_]/g, '')

  warn = (msg, vm) => {
    // 调用栈信息
    const trace = vm ? generateComponentTrace(vm) : ''

    // 是否注册了全局config的警告回调
    if (config.warnHandler) {
      // 调用 并传参
      config.warnHandler.call(null, msg, vm, trace)
    } else if (hasConsole && (!config.silent)) {
      // 如果能打log 并且没有设置全局静默 就直接输出 错误信息和调用栈  error级别
      console.error(`[Vue warn]: ${msg}${trace}`)
    }
  }


  tip = (msg, vm) => {
    // 如果能打log 并且没有设置全局静默 就直接输出 警告信息和调用栈  警告级别
    if (hasConsole && (!config.silent)) {
      console.warn(`[Vue tip]: ${msg}` + (
        vm ? generateComponentTrace(vm) : ''
      ))
    }
  }

  // 序列化 组件名
  formatComponentName = (vm, includeFile) => {
    // 如果是根节点 就返回<Root>
    if (vm.$root === vm) {
      return '<Root>'
    }
    // 实例化vm的时候 传入的options
    const options = typeof vm === 'function' && vm.cid != null
      ? vm.options
      : vm._isVue
        ? vm.$options || vm.constructor.options
        : vm || {}
    // options的name属性 一般都有设置   没有设置就用标签名
    let name = options.name || options._componentTag
    //
    const file = options.__file

    // 没有文件 并且有__file
    if (!name && file) {
      // 截取文件名
      const match = file.match(/([^/\\]+)\.vue$/)
      name = match && match[1]
    }

    return (
      // 如果有name转换成大写输出
      (name ? `<${classify(name)}>` : `<Anonymous>`) +
      //  输出file文件名
      (file && includeFile !== false ? ` at ${file}` : '')
    )
  }

  // 把字符串重复N次
  const repeat = (str, n) => {
    let res = ''
    while (n) {
      if (n % 2 === 1) res += str
      if (n > 1) str += str
      n >>= 1
    }
    return res
  }

  // 生成调用栈信息
  generateComponentTrace = vm => {
    if (vm._isVue && vm.$parent) {
      const tree = []
      let currentRecursiveSequence = 0
      // 向上查找直到找到根
      while (vm) {
        if (tree.length > 0) {
          // 获取最后一个
          const last = tree[tree.length - 1]
          // ？？递归的时候？
          if (last.constructor === vm.constructor) {
            currentRecursiveSequence++
            vm = vm.$parent
            continue
          } else if (currentRecursiveSequence > 0) {
            tree[tree.length - 1] = [last, currentRecursiveSequence]
            currentRecursiveSequence = 0
          }
        }
        // 添加进tree 后面拼接字符串用到
        tree.push(vm)
        // 重新赋值给父元素
        vm = vm.$parent
      }
      // 返回信息  found in
      return '\n\nfound in\n\n' + tree
        .map((vm, i) => `${
          i === 0 ? '---> ' : repeat(' ', 5 + i * 2)    // 如果是第一个输出 ---> 否者输出空格根据行号有多余缩进
        }${
          Array.isArray(vm)
            ? `${formatComponentName(vm[0])}... (${vm[1]} recursive calls)`   // 是一个数组的时候
            : formatComponentName(vm)                                         // 不是一个数组就返回组件名
        }`)
        .join('\n')
    } else {
      // 否则输出 found in xxx
      return `\n\n(found in ${formatComponentName(vm)})`
    }
  }
}
