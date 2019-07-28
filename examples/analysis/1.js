// 传入一个对象 返回一个构造函数
Vue.extend = function (extendOptions: Object): Function {
  // this代表Vue 不是vm
  const Super = this

  // 其他相关代码  缓存 等等
  // ......

  // 创建构造函数
  const Sub = function VueComponent (options) {
    this._init(options)
  }
  // 修改原型指向 把原型指向Super就是Vue
  Sub.prototype = Object.create(Super.prototype)
  Sub.prototype.constructor = Sub

  // 把super指向Vue
  Sub['super'] = Super

  // 其他相关代码  对Sub的扩展 等等
  // ......

  return Sub
}
