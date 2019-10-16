/* @flow */

import { parse } from 'compiler/parser/index'
import { generate } from './codegen'
import { optimize } from './optimizer'
import { createCompilerCreator } from 'compiler/create-compiler'

export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 看上去差不多 逻辑
  // 生成ast
  const ast = parse(template.trim(), options)
  // 优化ast 独有的
  optimize(ast, options)
  // 生成代码 独有的
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
