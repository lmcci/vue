/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

// 引入createCompiler是一个函数 返回的compileToFunctions
const { compile, compileToFunctions } = createCompiler(baseOptions)

export { compile, compileToFunctions }
