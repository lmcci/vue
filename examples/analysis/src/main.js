import Vue from './vue.esm'

new Vue({
  el: '#app',
  render(createElement){
    return createElement('div', null, [
      'Some text comes first.',
      createElement('h1', 'A headline'),
      createElement('h2', '2222222'),
    ])
  },
  data(){
    return {
      msg: 'hello'
    }
  },
});
