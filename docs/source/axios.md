# axios源码分析
* author: cpine
* time: 2021-12-23 17:40 
* address: https://cpine0208.github.io/source/axios

为了不打断我们的分析思路，我按整体流程进行分析，遇到打断主流程的内容会以附录的形式呈现！

## 一、执行流程
先看看axios整体的执行流程，有个大体的概念，后面会基本按着这个流程进行分析。
1. 由axios.creat()创建实例发起请求，或者直接由axios/axios.get/axios.post...发起请求；
2. 所有发起的请求通过request方法进行处理；
3. 请求拦截器（request interceptor），进行请求前的数据处理；
4. 请求数据转换器（request data transform），对传入的参数data和header进行数据转换，比如JSON.stringify(data)；
5. 适配器（adapter）判断是浏览器端还是 node 端，执行不同请求的方法，发起请求；
6. 相应数据装换器（response data transform），请求成功后，对服务端返回的数据进行转换，比如JSON.parse(data)；
7. 响应拦截器（response interceptor），对返回的数据进行处理，比如token失效退出登录，报错统一提示等；
8. 返回数据给调用的者。

## 二、入口文件（lib/axios.js）
简化后的代码如下：
```
function createInstance(defaultConfig) {
  ...
  return instance;
}
var axios = createInstance(defaults);
...
module.exports = axios;
```
首先定义了一个构建axios实例的函数，然后创建实例，挂载实例的一些方法[^1]，输出实例。可以看出所有的逻辑都在createInstance函数内部，下面一探究竟：
```
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);
  utils.extend(instance, Axios.prototype, context);
  utils.extend(instance, context);
  instance.create = function create(instanceConfig) {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}
```
* 第二行，创建一个上下文环境；
* 第三行，通过bind[^2]函数创建一个实例，可以直接用axios()发起请求；
* 第四行，挂载Axios上定义的原型对象，可以使用axios.get()等方法发起请求；
* 第五行，挂载上下文环境，可以访问上下文；
* 第六行，定义create函数，可以创建实例；

这里为了实现axios('url',config)这种形式的调用，第二行调用bind函数，是一个闭包，返回的是一个函数。调用axios('url',config)其实就是调用context.request('url',config)。

但instance这个函数是没有Axios.prototype上面的方法和Axios上的属性，所以要挂载这些方法和属性到instance这个方法上，来实现axios.get等方法；



## 附录
[^1]: axios实例中的其他方法
未完待续

[^2]: bind函数解析（lib/helpers/bind.js）
```
function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};
```
方法创建一个闭包函数；保存调用的函数和this指向的上下文；在返回的闭包函数被调用时，调用fn.apply(thisArg, args)执行函数；

