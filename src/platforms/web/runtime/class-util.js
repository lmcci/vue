/* @flow */

/**
 * Add class with compatibility for SVG since classList is not supported on
 * SVG elements in IE
 */
// 添加类名
export function addClass (el: HTMLElement, cls: ?string) {
  /* istanbul ignore if */
  // cls为空或者空格返回
  if (!cls || !(cls = cls.trim())) {
    return
  }

  /* istanbul ignore else */
  // 有classList属性
  if (el.classList) {
    // 可以一次设置多个类名用空格分开
    if (cls.indexOf(' ') > -1) {
      // 分割之后添加
      cls.split(/\s+/).forEach(c => el.classList.add(c))
    } else {
      // 只有一个的时候添加
      el.classList.add(cls)
    }
  } else {
    // 不支持classList的时候
    // 获取到原来的类名
    const cur = ` ${el.getAttribute('class') || ''} `
    // 判断要添加的类名是否存在 不存在就添加
    if (cur.indexOf(' ' + cls + ' ') < 0) {
      el.setAttribute('class', (cur + cls).trim())
    }
  }
}

/**
 * Remove class with compatibility for SVG since classList is not supported on
 * SVG elements in IE
 */
// 删除类名
export function removeClass (el: HTMLElement, cls: ?string) {
  /* istanbul ignore if */
  // 如果要删除的类名为空 或者空格就直接返回
  if (!cls || !(cls = cls.trim())) {
    return
  }

  /* istanbul ignore else */
  // 支持classList
  if (el.classList) {
    // 可以一次删除多个
    if (cls.indexOf(' ') > -1) {
      // 分割后循环删除
      cls.split(/\s+/).forEach(c => el.classList.remove(c))
    } else {
      // 只删除一个
      el.classList.remove(cls)
    }
    // 如果删除后类名长度为0  就删除class这个属性  class="" 没有意义
    if (!el.classList.length) {
      el.removeAttribute('class')
    }
  } else {
    // 获取到原来的类名字符串
    let cur = ` ${el.getAttribute('class') || ''} `
    // 拼接出要删除的字符串
    const tar = ' ' + cls + ' '
    // 如果有就替换成空格
    while (cur.indexOf(tar) >= 0) {
      cur = cur.replace(tar, ' ')
    }
    cur = cur.trim()
    // 如果删除后还有类名就设置 没有就删除class属性
    if (cur) {
      el.setAttribute('class', cur)
    } else {
      el.removeAttribute('class')
    }
  }
}
