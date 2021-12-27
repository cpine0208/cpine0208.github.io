# axios源码分析
* author: cpine
* time: 2021-12-23 17:40 
* email: 1551608188@qq.com
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
首先定义了一个构建axios实例的函数，然后创建实例，挂载实例的一些方法 *[1](#1)* ，输出实例。可以看出所有的逻辑都在createInstance函数内部，下面一探究竟：
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
* 第二行，创建一个上下文环境（this 指向）；
* 第三行，将 Axios.prototype.request 方法通过bind *[2](#2)* 函数创建一个新的实例 instance。bind *[2](#2)* 函数，返回的是一个闭包函数，开发中可以直接用axios('url',config)这种形式发起请求；但新创建的这个instance不是通过class new出来的instance，是没有Axios.prototype上面的方法和Axios上的属性，所以要挂载这些方法和属性到instance这个方法上，来实现axios.get等方法；
* 第四行，通过extend *[3](#3)* 挂载Axios上定义的原型对象，可以使用axios.get()等方法发起请求；
* 第五行，通过extend *[3](#3)* 挂载上下文环境，可以访问上下文；
* 第六行，定义create函数，可以创建实例；


## 三、构造函数Axios（lib/core/Axios.js）
下面来具体看看Axios这个构造函数。
```
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}
```
很简单，就是保存创建实例时传入的配置项。并初始化request和response的拦截器 *[5](#5)*。然后Axios的原型上定义了request函数，用于发起请求。axios.get/post等函数，本质上就是调用request这个函数，这是封装了一下，便于使用者使用。所以我们来具体看看request函数的真面目。
```
function request(configOrUrl, config) {
  // 运行axios('example/url'[, config])这样的形式发起请求
  if (typeof configOrUrl === 'string') {
    config = config || {};
    config.url = configOrUrl;
  } else {
    config = configOrUrl || {};
  }

  // 合并config
  config = mergeConfig (this.defaults, config);

  //设置请求方法
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }

  // 处理请求拦截器
  var requestInterceptorChain = [];
  var synchronousRequestInterceptors = true;
  // 调用拦截的forEach函数，遍历拦截器
  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    // 剔除不满足条件的拦截器
    if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
      return;
    }
    // 只有有一个不满足同步，全部按异步来处理
    synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
    // 添加到连接器链，所以可以看的晚注册的拦截器会先执行（队列）；
    requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  // 处理响应拦截器
  var responseInterceptorChain = [];
  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
  });

  var promise;

  // 请求拦截器是异步的情况时
  if (!synchronousRequestInterceptors) {
    // 创建请求国产数据处理链，初始为发起请求的回调函数
    var chain = [dispatchRequest, undefined];
    // 请求拦截器添加在处理链的头部
    Array.prototype.unshift.apply(chain, requestInterceptorChain);
    // 响应拦截器添加在处理链的尾部
    chain = chain.concat(responseInterceptorChain);
    // 初始化promise对象
    promise = Promise.resolve(config);
    // 处理链执行。
    while (chain.length) {
      // 这里要注意，then方法返回的是一个新的Promise实例，所有为了链式执行，处理完的数据一定要在拦截器里面返回。
      promise = promise.then(chain.shift(), chain.shift());
    }

    return promise;
  }

  // 请求拦截器是同步的情况时
  var newConfig = config;
  while (requestInterceptorChain.length) {
    var onFulfilled = requestInterceptorChain.shift();
    var onRejected = requestInterceptorChain.shift();
    try {
      newConfig = onFulfilled(newConfig);
    } catch (error) {
      onRejected(error);
      break;
    }
  }

  try {
    promise = dispatchRequest(newConfig);
  } catch (error) {
    return Promise.reject(error);
  }

  while (responseInterceptorChain.length) {
    promise = promise.then(responseInterceptorChain.shift(), responseInterceptorChain.shift());
  }

  return promise;

}
```
所有可以看出，request方法就是把注册的请求拦截器，请求，响应拦截器合并成一个处理链，一步一步处理完成，返回最终的结果，使用者就可以拿到相应的结果。

理解了request方法，我们就可以看axios.get等函数是怎么实现的。
```
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  Axios.prototype[method] = function(url, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: (config || {}).data
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  Axios.prototype[method] = function(url, data, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});
```
其实就是封装了request方法，为使用者提供方便的调用方式；get，post的区别就在于data，还是为了方便调用。

至此请求方法我们分析完成了，至于getUri方法不是主流程，我们按照惯例放到附录分析。这里只贴出简单的代码：
Axios.prototype.getUri = function getUri(config) {
  config = mergeConfig(this.defaults, config);
  return buildURL(config.url, config.params, config.paramsSerializer).replace(/^\?/, '');
};
mergeConfig具体分析 *[6](#6)* & buildURL具体分析 *[7](#7)*

## 四、派发请求函数dispatchRequest（lib/core/dispatchRequest.js）
通过对Axios构造函数的分析可以清楚的看到，请求数据处理是一条链式结构，一步一步执行。抛去拦截器这些我们自定义的处理函数，派发请求的则是dispatchRequest这个方法（注：这里我们先省略取消请求的操作）。
```
module.exports = function dispatchRequest(config) {

  // 确保header存在，转换器会用
  config.headers = config.headers || {};

  // 请求数据转换器
  config.data = transformData.call(
    config,
    config.data,
    config.headers,
    config.transformRequest
  );

  // 规范header
  config.headers = utils.merge(
    config.headers.common || {},
    config.headers[config.method] || {},
    config.headers
  );

  utils.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  // 获取发起请求的适配器
  var adapter = config.adapter || defaults.adapter;

  // 发起请求
  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // 响应数据转换器
    response.data = transformData.call(
      config,
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // 响应数据转换器
      if (reason && reason.response) {
        reason.response.data = transformData.call(
          config,
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};
```
可以看到，
1. 发起请求前会推请求头，通过transformData *[8](#8)* 函数对请求体，请求头进行数据转换，通过merge *[9](#9)* 函数对header进一步处理；
2. 然后获取请求方法，因为axios默认支持web端和nodejs端，所以会去判断环境，获取具体的请求方法；
3. 最后根据响应状态，通过transformData *[8](#8)* 对响应数据转换，返回给响应拦截器，进行下一步处理；

## 五、默认配置文件（lib/defaults.js）
通过对dispatchConfig函数的分析，看到适配器config.adapter，config.transformRequest，config.transformResponse是不是感觉有点懵了，我们使用axios的时候，大部分情况下并不需要我们自己去定义，那这些处理方法是哪里来的呢？其实这些都是创建实例是传入的默认配置，我们的所有配置都是在这个默认配置之上配置的。所以现在我们来具体看看这个默认配置。
```
var defaults = {

  // 不知道作者将这些配置放在一起的意思，但前两个用于响应数据转换，最后一个用于声明发生timeout时的提示信息
  transitional: {
    silentJSONParsing: true,
    forcedJSONParsing: true,
    clarifyTimeoutError: false
  },
  
  adapter: getDefaultAdapter(),

  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Accept');
    normalizeHeaderName(headers, 'Content-Type');

    if (utils.isFormData(data) ||
      utils.isArrayBuffer(data) ||
      utils.isBuffer(data) ||
      utils.isStream(data) ||
      utils.isFile(data) ||
      utils.isBlob(data)
    ) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    if (utils.isObject(data) || (headers && headers['Content-Type'] === 'application/json')) {
      setContentTypeIfUnset(headers, 'application/json');
      return stringifySafely(data);
    }
    return data;
  }],

  transformResponse: [function transformResponse(data) {
    var transitional = this.transitional || defaults.transitional;
    var silentJSONParsing = transitional && transitional.silentJSONParsing;
    var forcedJSONParsing = transitional && transitional.forcedJSONParsing;
    var strictJSONParsing = !silentJSONParsing && this.responseType === 'json';

    if (strictJSONParsing || (forcedJSONParsing && utils.isString(data) && data.length)) {
      try {
        return JSON.parse(data);
      } catch (e) {
        if (strictJSONParsing) {
          if (e.name === 'SyntaxError') {
            throw enhanceError(e, this, 'E_JSON_PARSE');
          }
          throw e;
        }
      }
    }

    return data;
  }],

  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  maxContentLength: -1,
  maxBodyLength: -1,

  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  },

  headers: {
    common: {
      'Accept': 'application/json, text/plain, */*'
    }
  }
};
```
可以看到，出来一些常规的配置，最主要的的是给出了默认的adapter，默认的transformRequest和默认的transformResponse的方法。由于adapter比较大我们下节分析。我们先看看默认的数据转换方法。
* **transformRequest** 请求数据拦截器处理之后的请求体和请求头会来到这里进行数据转换。默认的数据转换就是根据不同的数据格式进行相应的操作。比如我们最熟悉的是，对Object数据调用JSON.stringify进行编码；
* **transformResponse** 默认的数据转换只是进行简单的JSON解码，其他格式就需要自己去定义了。

## 六、请求适配器adapter（lib/adapters）
默认的请求适配器定义在默认配置里 `adapter: getDefaultAdapter()`，可以看下getDefaultAdapter这个函数：
```
function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    adapter = require('./adapters/xhr');
  } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
    adapter = require('./adapters/http');
  }

  return adapter;
}
```
判断环境调用不同的http请求器。
先来看一下我们最属性的web端的（lib/adapters/xhr.js），一起来回顾一下最原始是Ajax请求过程。（注：还是按照惯例先不去分析取消的实现方法）
```
function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data;
    var requestHeaders = config.headers;
    var responseType = config.responseType;

    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type']; // 让浏览器去自动设置
    }

    // 创建http请求
    var request = new XMLHttpRequest();

    // HTTP basic 身份验证
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

    // 初始化一个请求。
    var fullPath = buildFullPath(config.baseURL, config.url);
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // 配置timeout超时时间
    request.timeout = config.timeout;

    // 当请求结束时回调函数, 无论请求成功 ( load) 还是失败 (abort 或 error)。
    function onloadend() {
      if (!request) {
        return;
      }
      // 格式化输出响应数据
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      var responseData = !responseType || responseType === 'text' ||  responseType === 'json' ?
        request.responseText : request.response;
      var response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };
      // 此函数默认会根据response.status来判断成功与失败，你也可以自定义成功与失败的判断。
      settle(function _resolve(value) {
        resolve(value);
        done();
      }, function _reject(err) {
        reject(err);
        done();
      }, response);

      // 清除 request
      request = null;
    }

    // 事件处理函数
    if ('onloadend' in request) {
      // 浏览器支持此事件则直接用
      request.onloadend = onloadend;
    } else {
      // 作为 XMLHttpRequest 实例的属性之一，所有浏览器都支持 onreadystatechange。在浏览器不支持onloadend事件是用此事件模拟。
      request.onreadystatechange = function handleLoad() {
        if (!request || request.readyState !== 4) {
          return;
        }

        // The request errored out and we didn't get a response, this will be
        // handled by onerror instead
        // With one exception: request that using file: protocol, most browsers
        // will return status as 0 even though it's a successful request
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
          return;
        }
        // readystate handler is calling before onerror or ontimeout handlers,
        // so we should call onloadend on the next 'tick'
        setTimeout(onloadend);
      };
    }

    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }

      reject(createError('Request aborted', config, 'ECONNABORTED', request));

      request = null;
    };

    // 在请求过程中，若发生Network error则会触发此事件
    request.onerror = function handleError() {
      reject(createError('Network Error', config, null, request));

      request = null;
    };

    request.ontimeout = function handleTimeout() {
      var timeoutErrorMessage = config.timeout ? 'timeout of ' + config.timeout + 'ms exceeded' : 'timeout exceeded';
      var transitional = config.transitional || defaults.transitional;
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(createError(
        timeoutErrorMessage,
        config,
        transitional.clarifyTimeoutError ? 'ETIMEDOUT' : 'ECONNABORTED',
        request));

      request = null;
    };

    // 添加 xsrf header
    if (utils.isStandardBrowserEnv()) {
      var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
        cookies.read(config.xsrfCookieName) :
        undefined;

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // 添加请求头
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          delete requestHeaders[key];
        } else {
          request.setRequestHeader(key, val);
        }
      });
    }

    // 其他配置项，具体可以看mdn
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    if (responseType && responseType !== 'json') {
      request.responseType = config.responseType;
    }

    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }

    if (!requestData) {
      requestData = null;
    }

    // 发送请求
    request.send(requestData);
  });
};
```
至此我们已经把axios的整体流程走了一遍。nodejs端的http请求，我们就放到附录里具体看 *[10](#10)*。

## 七、取消请求


## 附录
**<span id='1'>[1]</span>: axios实例中的其他方法**
未完待续

**<span id='2'>[2]</span>: bind函数解析（lib/helpers/bind.js）**
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
方法创建一个闭包函数；保存调用的函数（第一个参数）和this指向的上下文（第二个参数）；在返回的闭包函数被调用时，调用fn.apply(thisArg, args)执行函数；

**<span id='3'>[3]</span>: extend函数解析（lib/utils.js）**
```
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}
```
将对象b中的属性扩展到对象a中，如果b中的属性是一个function，则通过bind函数为其绑定上下文thisArg参数。

**<span id='4'>[4]</span>: forEach函数解析（lib/utils.js）**
```
function forEach(obj, fn) {
  if (obj === null || typeof obj === 'undefined') {
    return;
  }

  if (typeof obj !== 'object') {
    obj = [obj];
  }

  if (isArray(obj)) {
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fn.call(null, obj[key], key, obj);
      }
    }
  }
}
```
兼容数组和对象的for循环

**<span id='5'>[5]</span>: InterceptorManager构造函数解析（lib/core/InterceptorManager.js）**
```
function InterceptorManager() {
  this.handlers = [];
}

InterceptorManager.prototype.use = function use(fulfilled, rejected, options) {
  this.handlers.push({
    fulfilled: fulfilled,
    rejected: rejected,
    synchronous: options ? options.synchronous : false,
    runWhen: options ? options.runWhen : null
  });
  return this.handlers.length - 1;
};

InterceptorManager.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

InterceptorManager.prototype.forEach = function forEach(fn) {
  utils.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};
```
可以看出拦截器的定义也很简单，用一个数组保存拦截器。use函数用来注册拦截器，eject函数用来移除拦截器，forEach则用来按一定顺序遍历所有注册的拦截器；具体看来：
* **use** 就是简单的网handlers里面添加拦截器。fulfilled，rejected分别对应promise的resolve，rejected状态调用的回调函数。synchronous用于标注处理器是不是同步的，默认为异步的；runWhen用来自定义合适执行此拦截器；
* **eject** 移除拦截器函数则更简单，直接就置数组的某位为null。具体位置则是由你注册时返回的位置；
* **forEach** 是自定义遍历函数。判断不为null的handler则传入到外部自定义函数fn中执行。

**<span id='6'>[6]</span>: mergeConfig函数解析（lib/core/mergeConfig.js）**


**<span id='7'>[7]</span>: buildURL函数解析（lib/helpers/buildURL.js）**

**<span id='8'>[8]</span>: transformData函数解析（lib/core/transformData.js）**
```
function transformData(data, headers, fns) {
  var context = this || defaults;
  utils.forEach(fns, function transform(fn) {
    data = fn.call(context, data, headers);
  });

  return data;
};
```
可以看出数据转换也是一个链式处理的方式，具体怎么处理，是用户自己定义的，当然默认配置里面也为我们定义了一份。

**<span id='9'>[9]</span>: merge函数解析（lib/utils.js）**

**<span id='10'>[10]</span>: nodejs端发起http请求（lib/adapters/http.js）**
