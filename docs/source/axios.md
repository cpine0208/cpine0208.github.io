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
首先定义了一个构建axios实例的函数，然后创建实例，挂载实例的一些方法，输出实例。可以看出所有的逻辑都在createInstance函数内部，下面一探究竟：
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
1. 创建一个上下文环境；
2. 通过bind[^1]函数创建一个实例,





[^1]: bind函数解析