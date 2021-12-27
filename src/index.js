'use strict';

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
  this.handlers.forEach(item => {
    if (item !== null) {
      fn(item)
    }
  })
};

const requestInterceptorManager = new InterceptorManager();

requestInterceptorManager.use((config) => {
  config.one += 1;
  console.log(config)
  return config
})

requestInterceptorManager.use((config) => {
  config.two += 2;
  console.log(config)

  return config
})

const requestInterceptorChain = [];
let synchronousRequestInterceptors = true;
requestInterceptorManager.forEach(function unshiftRequestInterceptors(interceptor) {
  if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
    return;
  }

  synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;

  requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
});
console.log(synchronousRequestInterceptors, requestInterceptorChain)
let promise = Promise.resolve({ one: 0, two: 0 });
while (requestInterceptorChain.length) {
  promise = promise.then(requestInterceptorChain.shift(), requestInterceptorChain.shift());
}

