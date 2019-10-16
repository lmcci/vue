import { isPlainObject } from 'shared/util'

const vm = require('vm')
const path = require('path')
const resolve = require('resolve')
const NativeModule = require('module')

// 创建一个沙盒
function createSandbox (context) {
  // 一个对象里面都是全局的方法  还有一个context
  const sandbox = {
    Buffer,
    console,
    process,
    setTimeout,
    setInterval,
    setImmediate,
    clearTimeout,
    clearInterval,
    clearImmediate,
    __VUE_SSR_CONTEXT__: context
  }
  // 重复引用
  sandbox.global = sandbox
  return sandbox
}

// 编译模块
function compileModule (files, basedir, runInNewContext) {
  const compiledScripts = {}
  const resolvedModules = {}

  function getCompiledScript (filename) {
    // 先从编译的脚本对象中取 有就直接返回
    if (compiledScripts[filename]) {
      return compiledScripts[filename]
    }
    // 从文件列表中取得源代码
    const code = files[filename]
    // 把代码转换成一个模块 运行？
    const wrapper = NativeModule.wrap(code)
    const script = new vm.Script(wrapper, {
      filename,
      displayErrors: true
    })
    // 添加到对象中 缓存
    compiledScripts[filename] = script
    return script
  }

  function evaluateModule (filename, sandbox, evaluatedFiles = {}) {
    // 从入参中取 有就直接返回
    if (evaluatedFiles[filename]) {
      return evaluatedFiles[filename]
    }

    // 通过文件名获取脚本
    const script = getCompiledScript(filename)
    // 执行的上下文
    const compiledWrapper = runInNewContext === false
      ? script.runInThisContext()
      : script.runInNewContext(sandbox)
    const m = { exports: {}}
    const r = file => {
      // 转换成相对路径
      file = path.posix.join('.', file)
      // 从文件列表中取，如果有就递归
      if (files[file]) {
        return evaluateModule(file, sandbox, evaluatedFiles)
      } else if (basedir) {
        // require 依赖模块
        return require(
          resolvedModules[file] ||
          (resolvedModules[file] = resolve.sync(file, { basedir }))
        )
      } else {
        // require 依赖模块
        return require(file)
      }
    }
    compiledWrapper.call(m.exports, m.exports, r, m)

    const res = Object.prototype.hasOwnProperty.call(m.exports, 'default')
      ? m.exports.default
      : m.exports
    evaluatedFiles[filename] = res
    return res
  }
  // 返回上面声明的函数
  return evaluateModule
}

// 深拷贝一个对象
function deepClone (val) {
  if (isPlainObject(val)) {
    const res = {}
    for (const key in val) {
      res[key] = deepClone(val[key])
    }
    return res
  } else if (Array.isArray(val)) {
    return val.slice()
  } else {
    return val
  }
}

export function createBundleRunner (entry, files, basedir, runInNewContext) {
  const evaluate = compileModule(files, basedir, runInNewContext)
  if (runInNewContext !== false && runInNewContext !== 'once') {
    // new context mode: creates a fresh context and re-evaluate the bundle
    // on each render. Ensures entire application state is fresh for each
    // render, but incurs extra evaluation cost.
    return (userContext = {}) => new Promise(resolve => {
      userContext._registeredComponents = new Set()
      const res = evaluate(entry, createSandbox(userContext))
      resolve(typeof res === 'function' ? res(userContext) : res)
    })
  } else {
    // direct mode: instead of re-evaluating the whole bundle on
    // each render, it simply calls the exported function. This avoids the
    // module evaluation costs but requires the source code to be structured
    // slightly differently.
    let runner // lazy creation so that errors can be caught by user
    let initialContext
    return (userContext = {}) => new Promise(resolve => {
      if (!runner) {
        const sandbox = runInNewContext === 'once'
          ? createSandbox()
          : global
        // the initial context is only used for collecting possible non-component
        // styles injected by vue-style-loader.
        initialContext = sandbox.__VUE_SSR_CONTEXT__ = {}
        runner = evaluate(entry, sandbox)
        // On subsequent renders, __VUE_SSR_CONTEXT__ will not be available
        // to prevent cross-request pollution.
        delete sandbox.__VUE_SSR_CONTEXT__
        if (typeof runner !== 'function') {
          throw new Error(
            'bundle export should be a function when using ' +
            '{ runInNewContext: false }.'
          )
        }
      }
      userContext._registeredComponents = new Set()

      // vue-style-loader styles imported outside of component lifecycle hooks
      if (initialContext._styles) {
        userContext._styles = deepClone(initialContext._styles)
        // #6353 ensure "styles" is exposed even if no styles are injected
        // in component lifecycles.
        // the renderStyles fn is exposed by vue-style-loader >= 3.0.3
        const renderStyles = initialContext._renderStyles
        if (renderStyles) {
          Object.defineProperty(userContext, 'styles', {
            enumerable: true,
            get () {
              return renderStyles(userContext._styles)
            }
          })
        }
      }

      resolve(runner(userContext))
    })
  }
}
