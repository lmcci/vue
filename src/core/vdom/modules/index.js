import directives from './directives'
import ref from './ref'

// 跨平台的modules  baseModules
// 在patch过程中到不同的生命周期的时候 会执行
export default [
  ref,
  directives
]
