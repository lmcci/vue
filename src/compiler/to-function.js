/* @flow */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'

type CompiledFunctionResult = {
  render: Function;
  staticRenderFns: Array<Function>;
};

// 把字符串转换成函数 报错就返回空实现的函数  把错误结果放在fnGenErrors
function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err, code })
    return noop
  }
}

// 这里传入的compile 是在create-compiler.js中定义的compile函数
export function createCompileToFunctionFn (compile: Function): Function {
  const cache = Object.create(null)

  // $mount中执行compileToFunctions是这个函数
  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {
    // 这个方法只是辅助，把编译生成的字符串通过new Function的方式生成一个函数 输出一些错误警告
    // 真正执行编译的是传入的compile函数


    // 拷贝options
    options = extend({}, options)
    // 配置的警告  如果没有指定一个默认
    const warn = options.warn || baseWarn
    // 删除原来的
    delete options.warn

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      try {
        // 尝试浏览器是否支撑 new Function()
        new Function('return 1')
      } catch (e) {
        if (e.toString().match(/unsafe-eval|CSP/)) {
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          )
        }
      }
    }

    // check cache
    // 使用缓存 减少编译耗时
    // delimiters分割符 传入了分割符 就转换成字符串拼接上模板 没有传分割符就直接使用模板
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template
    // 把上面的拼接的key 从缓存中取有就直接返回
    if (cache[key]) {
      return cache[key]
    }

    // compile
    // 真正编译的过程
    // compile() 是传入的
    // 这个方法的核心 就是调用编译函数
    const compiled = compile(template, options)

    // check compilation errors/tips
    // 编译完成之后 输出 警告和提示
    if (process.env.NODE_ENV !== 'production') {
      if (compiled.errors && compiled.errors.length) {
        warn(
          `Error compiling template:\n\n${template}\n\n` +
          compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
          vm
        )
      }
      if (compiled.tips && compiled.tips.length) {
        compiled.tips.forEach(msg => tip(msg, vm))
      }
    }

    // turn code into functions
    const res = {}
    const fnGenErrors = []
    // 编译之后compiled.render 是一个字符串 转换成函数  如果转换出错返回的是一个空函数 把错误结果放在fnGenErrors
    res.render = createFunction(compiled.render, fnGenErrors)
    res.staticRenderFns = compiled.staticRenderFns.map(code => {
      return createFunction (code, fnGenErrors)
    })

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    // 输出警告信息
    if (process.env.NODE_ENV !== 'production') {
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        warn(
          `Failed to generate render function:\n\n` +
          fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
          vm
        )
      }
    }

    // 把编译结果存在缓存中 并返回
    return (cache[key] = res)
  }
}
