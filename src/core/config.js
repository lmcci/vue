/* @flow */

import {
  no,
  noop,
  identity
} from 'shared/util'

import { LIFECYCLE_HOOKS } from 'shared/constants'

export type Config = {
  // user
  // 用户全局配置
  optionMergeStrategies: { [key: string]: Function };
  silent: boolean;
  productionTip: boolean;
  performance: boolean;
  devtools: boolean;
  errorHandler: ?(err: Error, vm: Component, info: string) => void;
  warnHandler: ?(msg: string, vm: Component, trace: string) => void;
  ignoredElements: Array<string | RegExp>;
  keyCodes: { [key: string]: number | Array<number> };

  // platform
  // 平台相关
  isReservedTag: (x?: string) => boolean;
  isReservedAttr: (x?: string) => boolean;
  parsePlatformTagName: (x: string) => string;
  isUnknownElement: (x?: string) => boolean;
  getTagNamespace: (x?: string) => string | void;
  mustUseProp: (tag: string, type: ?string, name: string) => boolean;

  // legacy
  _lifecycleHooks: Array<string>;
};

export default ({
  /**
   * Option merge strategies (used in core/util/options)
   */
  // $flow-disable-line
  // 自定义option合并策略
  optionMergeStrategies: Object.create(null),

  /**
   * Whether to suppress warnings.
   */
  // 默认非静默
  silent: false,

  /**
   * Show production mode tip message on boot?
   */
  // 提示信息
  productionTip: process.env.NODE_ENV !== 'production',

  /**
   * Whether to enable devtools
   */
  // devtools 生产环境false
  devtools: process.env.NODE_ENV !== 'production',

  /**
   * Whether to record perf
   */
  // 性能埋点
  performance: false,

  /**
   * Error handler for watcher errors
   */
  // 全局的错误捕获
  errorHandler: null,

  /**
   * Warn handler for watcher warns
   */
  // 全局的警告捕获
  warnHandler: null,

  /**
   * Ignore certain custom elements
   */
  // 配置需要忽略哪些元素名称的警告 比如不属于保留标签 没有注册组件会抛出警告
  ignoredElements: [],

  /**
   * Custom user key aliases for v-on
   */
  // $flow-disable-line
  // 键盘的keyCode和自定义名称 比如在input中使用
  keyCodes: Object.create(null),

  /**
   * Check if a tag is reserved so that it cannot be registered as a
   * component. This is platform-dependent and may be overwritten.
   */
  // 默认是一个永远返回false的函数
  // 是否是一个保留标签
  isReservedTag: no,

  /**
   * Check if an attribute is reserved so that it cannot be used as a component
   * prop. This is platform-dependent and may be overwritten.
   */
  // 默认是一个永远返回false的函数
  // 是否是一个保留属性
  isReservedAttr: no,

  /**
   * Check if a tag is an unknown element.
   * Platform-dependent.
   */
  // 默认是一个永远返回false的函数
  // 是否是一个未知元素
  isUnknownElement: no,

  /**
   * Get the namespace of an element
   */
  // 默认是一个空函数
  // 获取元素标签的命名空间
  getTagNamespace: noop,

  /**
   * Parse the real tag name for the specific platform.
   */
  // 默认是一个入参就是返回值的函数
  // 转换成特定平台的标签
  parsePlatformTagName: identity,

  /**
   * Check if an attribute must be bound using property, e.g. value
   * Platform-dependent.
   */
  // 默认是一个永远返回false的函数
  // 是否必须使用prop
  mustUseProp: no,

  /**
   * Exposed for legacy reasons
   */
  // 历史遗留问题
  // 生命周期 的字符串列表
  _lifecycleHooks: LIFECYCLE_HOOKS
}: Config)
