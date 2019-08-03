/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// 传入的参数是一个函数 返回值也是一个函数
export function createCompilerCreator (baseCompile: Function): Function {
  // 在 web/index.js中使用的createCompiler就是这个函数
  // 返回值 compile, compileToFunctions
  // 主要是做了option的合并
  return function createCompiler (baseOptions: CompilerOptions) {
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      // 对传入的baseOptions的处理  和 传入的options做合并
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []
      // 警告信息
      finalOptions.warn = (msg, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {
        // merge custom modules
        // options.modules 做拼接
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        // options.directives做合并
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        // 上面modules directives 合并过了  这里除了这两个直接赋值
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      // baseCompile是传入的
      // src/compiler/index.js 中定义的 一个函数 通过参数方式传入的
      const compiled = baseCompile(template, finalOptions)
      // 非生产环境下 ast多一次检查 有错误放在错误数组中
      if (process.env.NODE_ENV !== 'production') {
        errors.push.apply(errors, detectErrors(compiled.ast))
      }
      // 错误 提示 放在这两个数组中
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
