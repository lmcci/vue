/* @flow */

let decoder

export default {
  decode (html: string): string {
    // decoder会缓存 如果上次又就用
    // 第一次进就创建一个dev
    decoder = decoder || document.createElement('div')
    // 把参数设置成innerHTML
    decoder.innerHTML = html
    // 过滤html标签只保留 文本内容
    // textContent display none的也能得到  style script的内容也能得到 会有多余的空格
    // innerText
    return decoder.textContent
  }
}
