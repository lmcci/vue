function fn(options) {
  this.init(options)
}

fn.prototype.init = function (options) {
  console.log(options)
}


new fn({
  msg: 'hello world'
})

