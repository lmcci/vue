import { inBrowser } from './env'

export let mark
export let measure

// 非生产环境下的性能埋点
if (process.env.NODE_ENV !== 'production') {
  // 在浏览器环境中 从window下拿到performance对象
  const perf = inBrowser && window.performance
  /* istanbul ignore if */
  if (
    perf &&
    perf.mark &&
    perf.measure &&
    perf.clearMarks &&
    perf.clearMeasures
  ) {
    // 对mark赋值 调用的时候使用perf.mark
    mark = tag => perf.mark(tag)
    // 对measure赋值 调用的时候使用measure clearMarks clearMeasures
    measure = (name, startTag, endTag) => {
      perf.measure(name, startTag, endTag)
      perf.clearMarks(startTag)
      perf.clearMarks(endTag)
      perf.clearMeasures(name)
    }
  }
}
