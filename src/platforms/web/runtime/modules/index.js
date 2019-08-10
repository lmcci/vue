import attrs from './attrs'
import klass from './class'
import events from './events'
import domProps from './dom-props'
import style from './style'
import transition from './transition'

// 在patch过程中执行到不同的生命周期的时候 会执行到这里对应的函数
// web平台相关的
export default [
  attrs,
  klass,
  events,
  domProps,
  style,
  transition
]
