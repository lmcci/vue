/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// 是输出了createCompilerCreator的返回值 也是一个函数  参数也是一个函数
// 传了三次 最终还是调用这里
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 生成ast对象 描述html模板 父子关系 属性 标签名 类型等等
  // options是合并各个平台的option
  // 模板去除两边的空格
  const ast = parse(template.trim(), options)
  // ast优化
  // 区分静态的和动态数据驱动的节点
  // 在没有需要实时变化的地方 就标记出来 patch的时候直接跳过了
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  // 由ast生成code
  // 把ast对象转成代码  要被转换成render函数
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
