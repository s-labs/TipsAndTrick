/*! Mirage 2.0, Adaptive Image Loader Client. Copyright 2013 CloudFlare, Inc. */
CloudFlare.define(
  ['cloudflare/iterator', 'cloudflare/dom', 'cloudflare/utility',
   'cloudflare/path', 'cloudflare/loader', 'cloudflare/deferred',
   'cloudflare/profiler', 'cloudflare/config', 'cloudflare/classes', 'cloudflare/console'],
  function(iter, dom, util, path, loader, q, Profiler, config, classes, console) {

    /**
     * @type {Object} The config hash for Mirage2.
     */
      var mirageConfig = config.mirage2;
      mirageConfig.maxjsonsize = mirageConfig.maxjsonsize || 100000;
      mirageConfig.profile = mirageConfig.profile || false;
      mirageConfig.maxdegradedimages = mirageConfig.maxdegradedimages || 50;
      mirageConfig.maxexternalimages = mirageConfig.maxexternalimages || 50;
      mirageConfig.eagerLoad = mirageConfig.eagerLoad || false;
      mirageConfig.petoken = config.petok;

    /**
     * @type {Object} The config hash for the profiler, derived from the
     * Mirage2 config and the global config.
     */
    var profileConfig = {
        maxJsonSize : mirageConfig.maxjsonsize,
        enabled : mirageConfig.profile,
        zone : config.zone
    };

    /**
     * This is our profiler instance.
     * TODO: We need to figure out the best way to conditionally include
     * the profiler. My inclination is to use a build step that optionally
     * lexes this library and removes all references to the profiler.
     * @type {Profiler}
     */
    var profiler = new Profiler( profileConfig );
    profiler.mark('start');


    /**
     * Register a handler to be called whenever there is a mutation event.
     * This is an extension of the dom module. It is mostly relevant for the
     * profiler, so it may be moved in the future.
     * @mixin
     */
    dom.onMutation = dom.onMutation || (function() {

      if (!mirageConfig.profile) return function(){};

      var MutationObserver = (function() {
        return window.MutationObserver ||
               window.WebKitMutationObserver ||
               window.MozMutationObserver || function() {
                 this.disconnect = function(){},
                 this.observe = function(){};
               };
      })();
      var mutationObserver = new MutationObserver(function(mutations) {
        iter.forEach(mutations, function(mutation) {
          iter.forEach(cache, function(fn) {
            fn(mutation);
          });
        });
      });
      var cache = [];

      dom.onReady.then(function() {
        var target = document.getElementsByTagName('body')[0];

        mutationObserver.observe(target, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
      });

      return function onMutation(fn) {
        cache.push(fn);
      };
    })();


    /**
    * A function to support Array reduce for browsers that do not support it
    * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce
    * @param {Array} array The Array to be reduced.
    * @param {Function} callback The function to be called on each value in the array  
    * @param {Number} opt_initialValue The initial value to be used in the first function call.
    **/
    function arrayReduce(array, callback, opt_initialValue){
      if ('function' !== typeof callback) {
        throw new TypeError(callback + ' is not a function');
      }
      var index = 0, length = array.length >>> 0, value, isValueSet = false;
      if (1 < arguments.length) {
        value = opt_initialValue;
        isValueSet = true;
      }
      for ( ; length > index; ++index) {
        if (!array.hasOwnProperty(index)) continue;
        if (isValueSet) {
          value = callback(value, array[index], index, array);
        } else {
          value = array[index];
          isValueSet = true;
        }
      }
      if (!isValueSet) {
        throw new TypeError('Reduce of empty array with no initial value');
      }
      return value;
    }


    /**
    * A wrapper to support ArrayBuffer slicing as IE10 does not support ArrayBuffer.slice
    * @param {ArrayBuffer} buffer The ArrayBuffer to be copied from.
    * @param {Number} begin The start index of the slice to be copied (inclusive)  
    * @param {Number} end The end index of teh slice to be copied (exclusive).
    */

    function arrayBufferSlice(buffer, begin, end) {

      var dataView, byteLength, len, out, i = 0;

      if (typeof buffer == 'undefined') return;

      if (window.ArrayBuffer && ArrayBuffer.prototype.slice) {
        return ArrayBuffer.prototype.slice.call(buffer, begin, end);
      }
      else {
        if (typeof end == 'undefined') {
          end = buffer.byteLength;
        }

        if (typeof begin == 'undefined') {
          begin = 0;
        }

        if (end === 0) {
          return new ArrayBuffer();
        }
        end = end || buffer.byteLength;
        if (end < 0 ) {
          end = buffer.byteLength + end;
        }
        if (begin < 0 ) {
          begin = buffer.byteLength + begin;
        }

        byteLength = end - begin;
        if(byteLength <= 0){
          return new ArrayBuffer();
        }
        dataView = new DataView(buffer, begin, byteLength);
        len = dataView.byteLength;
        out = new Uint8Array(len);
        while(i<len){
          out[i]=dataView.getUint8(i);
          i++;
        }
        return out.buffer;
      }
    }

    /**
     * A helpful wrapper around Object.defineProperty. Possibly useful for
     * polyfill down the road.
     * @param {Object} object The target object to define a property on.
     * @param {String} property The name of the property being defined.
     * @param {Object} descriptor The descriptor of the property being defined.
     * @return {Function} A 'restoration' function that will reset the defined
     * property to whatever its original descriptor or value was.
     */
    function defineProperty(object, property, descriptor) {
      var oldValue = object[property],
          oldDescriptor,
          oldGetter,
          oldSetter;


      if (dom.hasStandardAccessors()) {
        oldDescriptor = Object.getOwnPropertyDescriptor(object, property) ||
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(object), property) ||
            {
              value: oldValue,
              writable: true,
              configurable: true,
              enumerable: true
            };


        try {
          assert(oldDescriptor.configurable, 'Property must be configurable.');
          assert(!!descriptor, 'Property descriptor must be defined.');
        } catch(e) {
          throw new Error('Invalid attempt to redefine "' + property + '".', e.message);
          //        error('Invalid attempt to redefine "' + property + '".', e.message);
        }

        if (dom.internetExplorer !== 8) {

          if (typeof descriptor.get === 'undefined' &&
          typeof descriptor.set === 'undefined') {
            descriptor.writable = true;
          }

          descriptor.enumerable = descriptor.enumerable === false ? false : true;
          descriptor.configurable = descriptor.configurable === false ? false : true;
        }

        try {
          Object.defineProperty( object, property, descriptor);
        } catch(e) {
          error('Failed to define property "' + property + '".', e.message);
        }
      } else if (dom.hasAlternateAccessors()) {
        oldGetter = object.__lookupGetter__(property);
        oldSetter = object.__lookupSetter__(property);

        object.__defineGetter__(property, descriptor.get);
        object.__defineSetter__(property, descriptor.set);
      }

      return function restoreDescriptor() {
        try {
          if (dom.hasStandardAccessors()) {
            Object.defineProperty(object, property, oldDescriptor);
          } else if (dom.hasAlternateAccessors()) {
            if (typeof oldGetter !== 'undefined' && typeof oldSetter !== 'undefined') {
              object.__defineGetter__(property, oldGetter);
              object.__defineSetter__(property, oldSetter);
            }
          }
        } catch(e) {
          error('Failed to restore user-defined property "' + property + '".',
                e.message);
        }
      };
    }


    /**
     * Cross-browser-safe origin resolver.
     */
    function getOrigin() {
      var locationParts;

      if (window.location.origin) {
        return window.location.origin;
      }

      locationParts = path.parseURL(window.location.toString());

      return locationParts.protocol + '://' +
             locationParts.host + ':' +
             locationParts.port;
    }


    /**
     * General purpose assertion function.
     */
    function assert(truth, message) {
      if (!truth) {
        throw new Error(message);
      }
    }


    /**
     * General purpose context binding function.
     */
    function bind(fn, context) {
      return function() {
        return fn.apply(context, arguments);
      };
    }


    /**
     * General purpose debounce function.
     */
    function debounce(fn, threshold) {
      var timer = null;
      return function() {
        var args = arguments;
        var context = this;

        if (timer !== null) {
          window.clearTimeout(timer);
        }

        timer = window.setTimeout(function() {
          fn.apply(context, args);
        }, threshold);
      };
    }


    /**
     * Cross-browser Blob polyfill.
     */
    function createBlob(content, options) {
      var BlobBuilder;
      var builder;
      var blob;

      options = options || {
        type: 'text/javascript'
      };

      try {
        blob = new Blob([content], options);
      } catch(e) {
        BlobBuilder = this.BlobBuilder ||
                      this.WebKitBlobBuilder ||
                      this.MozBlobBuilder;
        builder = new BlobBuilder();
        builder.append(content);
        blob = builder.getBlob(options && options.type);
      }

      return blob;
    }


    /**
     * A superficial nextTick implementation.
     */
    function nextTick(fn) {
      return setTimeout(fn, 0);
    }


    /**
     * There can only be one URL.
     */
    var url = window.URL || window.webkitURL || window.mozURL;


    /**
     * Resolve the origin for later reference.
     */
    var origin = getOrigin();


    /**
     * A Thread is an intermediary that allows for transparent code sharing
     * between a parent process and a Worker. When available, classes that
     * are assimilated by a thread are executed within Worker threads. When
     * not available, the same classes are executed within the parent thread.
     * @constructor
     */
    var Thread = function Thread(options) {
      this.nextUniqueId_ = 1;
      // Test for web worker. IE10 considers url.createObjectURL to be from a different origin.
      this.supportsWebWorkers_ = (function(){
        try {
          if (typeof window.Worker === 'undefined') {
            return false;
          }
          var testWorker_ = new window.Worker(url.createObjectURL(createBlob('')));
          return true;
        } catch(e) {
          return false;
        }
      })();

      this.factories_ = {};
      this.operations_ = {};
      this.workerMessageHandlers = {};
      this.worker_ = null;
      this.scriptUrl_ = null;

      if (options && options.enableWebWorkers === false) {
        this.supportsWebWorkers_ = false;
      }

      this.isReady_ = q.ref();
    };
    // Instrumentation..
    Thread = profiler.spyOnClass(Thread, 'Thread');
    Thread.timeConstructor(['worker']);


    /** @inheritDoc **/
    Thread.workerAssert = assert;


    /** @inheritDoc **/
    Thread.workerNextTick = nextTick;


    /** @inheritDoc **/
    Thread.workerBind = bind;


    /** @inheritDoc **/
    Thread.workerCreateBlob = createBlob;


    /**
     * @type {Function} A Promises/A+ API generator for use within a Worker
     * thread.
     * @static
     */
    Thread.workerPromises = function() {


      /**
       * Creates a new Deferred instance.
       */
      function defer() {
        return new Deferred();
      }


      /**
       * Creates a fulfilled promise instance.
       * @param {Object=} value An optional value to fulfill the promise with.
       */
      function ref(value) {
        var promise = new Promise();
        promise.setFulfilled(value);
        return promise;
      }


      /**
       * Creates a rejected promise instance.
       * @param {Object=} reason An optional reason to reject the promise.
       */
      function reject(reason) {
        var promise = new Promise();
        promise.setRejected(reason);
        return promise;
      }


      /**
       * @constructor
       */
      function Deferred() {
        this.promise = new Promise();
      }


      /**
       * @param {Object=} value An optional value to resolve the promise with.
       */
      Deferred.prototype.resolve = function(value) {
        this.promise.setFulfilled(value);
      };


      /**
       * @param {Object=} reason An optional reason to reject the promise.
       */
      Deferred.prototype.reject = function(reason) {
        this.promise.setRejected(reason);
      };



      /**
       * @constructor
       */
      function Promise() {
        this.handlers_ = [];
        this.state_ = Promise.state.PENDING;
        this.value_ = undefined;
        this.boundFulfilled_ = bind(this.setFulfilled, this);
        this.boundRejected_ = bind(this.setRejected, this);
      }


      /**
       * @enum {String} An enumeration of Promise states.
       */
      Promise.state = {
        PENDING: 'pending',
        FULFILLED: 'fulfilled',
        REJECTED: 'rejected'
      };


      /**
       * @param {Function=} fn An optional function to call.
       * @param {Deferred} result A deferred representing the next promise.
       */
      Promise.chain = function(fn, result) {
        return function(value) {
          var reason;

          if (typeof fn === 'function') {
            try {
              value = fn(value);
            } catch(e) {
              reason = e;
            }
          }

          if (reason) {
            result.reject(reason);
          } else {
            result.resolve(value);
          }
        };
      };


      /**
       * @param {Function=} onFulfilled An optional fulfilled callback.
       * @param {Function=} onRejected An optional rejected callback.
       * @return {Promise} A promise that resolves with the eventual result of
       * the fulfillment or rejection callbacks.
       */
      Promise.prototype.then = function(onFulfilled, onRejected) {
        var result = new Deferred();

        nextTick(bind(function() {
          var args = {
            onFulfilled: Promise.chain(onFulfilled, result),
            onRejected: Promise.chain(onRejected, result)
          };

          this.handlers_.push(args);

          if (this.state_ !== Promise.state.PENDING) {
            this.flush_();
          }
        }, this));

        return result.promise;
      };


      /**
       * @param {Object=} value An optional value to fulfill the promise with.
       */
      Promise.prototype.setFulfilled = function(value) {
        if (this.state_ === Promise.state.PENDING) {
          if (value && typeof value.then === 'function') {
            value.then(this.boundFulfilled_, this.boundRejected_);
          } else {
            this.value_ = value;
            this.state_ = Promise.state.FULFILLED;
            this.flush_();
          }
        }
      };


      /**
       * @param {Object=} reason An optional reason why the promise has been
       * rejected.
       */
      Promise.prototype.setRejected = function(reason) {
        if (this.state_ === Promise.state.PENDING) {
          this.value_ = reason;
          this.state_ = Promise.state.REJECTED;
          this.flush_();
        }
      };


      /**
       * Handles calling fulfillment and rejection handlers.
       * @private
       */
      Promise.prototype.flush_ = function() {
        nextTick(bind(function() {
          var value = this.value_;
          var state = this.state_;
          var onFulfilled;
          var onRejected;

          for (var i = 0; i < this.handlers_.length; ++i) {
            onFulfilled = this.handlers_[i].onFulfilled;
            onRejected = this.handlers_[i].onRejected;

            if (state === Promise.state.FULFILLED) {
              onFulfilled(value);
            } else if (state === Promise.state.REJECTED) {
              onRejected(value);
            }
          }

          this.handlers_ = [];
        }, this));
      };


      // Return defer, ref and reject as the Promise API..
      return {
        defer: defer,
        ref: ref,
        reject: reject
      };
    };


    /**
     * @type {Function} A re-usable function for handling event dispatch within
     * a Worker.
     * @static
     */
    Thread.workerDispatch = function dispatch(event) {
      var worker = this;
      var data = event.data;
      var args = data['arguments'];
      var instance;
      var result;

      // TODO: Replace with event system so we don't hold references..
      worker.instances = worker.instances || {};

      switch (data.type) {
        case 'createInstance':
          instance = new worker[data.className](args[0], args[1], args[2],
                                                    args[3], args[4], args[5]);
          worker.postMessage({
            operationId: data.operationId,
            value: undefined
          });

          worker.instances[data.instanceId] = instance;
          break;
        case 'executeMethod':
          instance = worker.instances[data.instanceId];

          try {
            result = q.ref(instance[data.method].apply(instance, data['arguments']));
          } catch(e) {
            result = q.reject(e);
          }

          result.then(function(value) {
            worker.postMessage({
              operationId: data.operationId,
              value: value
            });
          }, function(e) {
            worker.postMessage({
              operationId: data.operationId,
              value: undefined,
              message: e && (e.message || e.toString()),
              error: true
            });
          });

          break;
      }
    };


    /**
     * @type {Function} A re-usable function for handling error messages
     * from within a Worker.
     * @static
     */
    Thread.workerError = function error(event) {
      var worker = this;
      worker.log(event.toString());
    };


    /**
     * @type {Function} A re-usable function for handling log messages from
     * within a Worker.
     * @static
     */
    Thread.workerLog = function log() {
      var messages = Array.prototype.slice.call(arguments);
      var worker = this;
      worker.postMessage({
        operationId: undefined,
        message: messages
      });
    };


    /**
     * @type {String} The message type used for instance creation.
     * @static
     */
    Thread.CREATE_INSTANCE = 'createInstance';


    /**
     * @type {String} The message type used for method execution.
     * @static
     */
    Thread.EXECUTE_METHOD = 'executeMethod';


    /**
     * @param {String} name The name of the class to be mirrored in a worker.
     * @param {Function} factory A stringifiable factory that generates a
     * cosntructor for the class.
     * @return {Function} A constructor for the assimilated class.
     */
    Thread.prototype.createProxy = function(name, factory, listeners) {
      var OriginalClass = factory(bind(console.log, console),
                                  bind(console.error, console));

      var thread = this;
      var ThreadProxyClass = function ThreadProxyClass() {
        // Instantiate class in worker..
        var args = Array.prototype.slice.call(arguments);
        if (thread.supportsWebWorkers_) {
          this.instanceId_ = thread.getUniqueId_();
          this.instantiates_ = thread.createInstance_(name, this.instanceId_, args);
        } else {
          return new OriginalClass(args[0], args[1], args[2], args[3],
                                   args[4], args[5]);
        }
      };
      var copy = function(method) {
        ThreadProxyClass.prototype[method] = function() {
          var args = Array.prototype.slice.call(arguments);
          return this.instantiates_.then(bind(function() {
            return thread.executeMethod_(this.instanceId_, method, args);
          }, this));
        };
      };


      for (var s in OriginalClass) {
        ThreadProxyClass[s] = OriginalClass[s];
      }

      for (var m in OriginalClass.prototype) {
        copy(m);
      }

      if (listeners) {
        this.workerMessageHandlers[listeners.event] = listeners.cb;
      }

      this.factories_[name] = factory;

      return ThreadProxyClass;
    };
    // Instrumentation..
    Thread.timeMethod('createProxy', ['proxy', 'worker']);


    /**
     * Activates the worker thread.
     */
    Thread.prototype.start = function() {
      return this.isReady_.then(bind(function() {
        if (this.supportsWebWorkers_) {
          this.scriptUrl_ = this.getWorkerUrl_();

          this.stop();
          this.worker_ = new window.Worker(this.scriptUrl_);
          this.worker_.onmessage = bind(this.handleWorkerMessage_, this);
        }
      }, this));
    };
    // Instrumentation..
    Thread.timePromisedMethod('start', ['proxy', 'worker']);


    /**
     * Deactivates the worker thread.
     */
    Thread.prototype.stop = function() {
      if (this.worker_) {
        this.worker_.terminate();
        this.worker_ = null;

        url.revokeObjectURL(this.scriptUrl_);
        this.scriptUrl_ = null;
      }
    };
    // Instrumentation..
    Thread.timeMethod('stop', ['proxy', 'worker']);


    /**
     * @return {Number} A unique ID.
     * @private
     */
    Thread.prototype.getUniqueId_ = function() {
      return this.nextUniqueId_++;
    };


    /**
     * @param {String} className The name of the class to instantiate.
     * @param {Number} instanceId The ID to assign to the class instance.
     * @param {Array} args An array of arguments to pass to the constructor.
     * @return {Promise} A promise that resolves when the instance has been
     * created.
     * @private
     */
    Thread.prototype.createInstance_ = function(className, instanceId, args) {
      if (!this.worker_) {
        return q.ref();
      }

      var result = q.defer();
      var operationId = this.getUniqueId_();

      this.operations_[operationId] = result;

      this.worker_.postMessage({
        type: Thread.CREATE_INSTANCE,
        className: className,
        instanceId: instanceId,
        operationId: operationId,
        'arguments': args
      });

      return result.promise;
    };
    // Instrumentation..
    Thread.timePromisedMethod('createInstance_', ['proxy', 'worker']);


    /**
     * @param {Number} instanceId The ID of a class instance.
     * @param {String} method The name of a method to call on the instance.
     * @param {Array} args An array of arguments to pass to the method.
     * @return {Promise<*>} A promise that resolves with the result of the
     * method that has been called.
     * @private
     */
    Thread.prototype.executeMethod_ = function(instanceId, method, args) {
      var result = q.defer();
      var operationId = this.getUniqueId_();

      this.operations_[operationId] = result;

      this.worker_.postMessage({
        type: Thread.EXECUTE_METHOD,
        instanceId: instanceId,
        operationId: operationId,
        method: method,
        'arguments': args
      });

      return result.promise;
    };
    // Instrumentation..
    Thread.timePromisedMethod('executeMethod_', ['proxy', 'worker']);


    /**
     * @param {MessageEvent} event A message event from the Worker.
     * @private
     */
    Thread.prototype.handleWorkerMessage_ = function(event) {
      var data = event.data;
      var operationId = data.operationId;
      var message = data.message;
      var value = data.value;
      var error = data.error;
      var result = this.operations_[operationId];

      if (operationId && result) {
        if (error) {
          result.reject(new Error(message));
        } else {
          result.resolve(value);
        }
      }

      if (data.operation) {
        if (this.workerMessageHandlers[data.operation]) {
          this.workerMessageHandlers[data.operation].apply(null, data['arguments']);
        }
      }

      if (message) {
        if (!(message instanceof Array)) {
          message = [message];
        }
        message.unshift('THREAD');
        log.apply(log, message);
      }
    };
    // Instrumentation..
    Thread.timeMethod('handleWorkerMessage_', ['proxy', 'worker']);

    /**
     * @return {String} A URL that can be used to instantiate a Worker.
     * @see http://www.html5rocks.com/en/tutorials/workers/basics/#toc-inlineworkers-loadingscripts
     * @private
     */
    Thread.prototype.getWorkerUrl_ = function() {
      var script = 'this.onmessage = function(event) { dispatch(event); };\n' +
                   'this.onerror = function(event) { error(event); };\n';
      var blob;

      script += 'var origin = "' + origin + '";\n';
      script += 'var q = (' + Thread.workerPromises.toString() + ')();\n';
      script += 'var mirageConfig = {maxdegradedimages : '+ mirageConfig.maxdegradedimages + ',';
      script += 'eagerLoad : '+ mirageConfig.eagerLoad + '};\n';
      script += 'var url = this.URL || this.webkitURL || this.mozURL;\n';

      script += Thread.workerAssert.toString() + ';\n';
      script += Thread.workerNextTick.toString() + ';\n';
      script += Thread.workerBind.toString() + ';\n';
      script += Thread.workerCreateBlob.toString() + ';\n';
      script += Thread.workerDispatch.toString() + ';\n';
      script += Thread.workerError.toString() + ';\n';
      script += Thread.workerLog.toString() + ';\n';

      for (var name in this.factories_) {
        script += 'var ' + name + ' = (' +
                  this.factories_[name].toString() +
                  ')(log, log);\n';
      }

      script += '//@ sourceURL=MirageThreadWorker.js\n';

      blob = createBlob(script);

      return url.createObjectURL(blob);
    };
    // Instrumentation..
    Thread.timeMethod('getWorkerUrl_', ['proxy', 'worker']);


    /**
     * @type {Thread} A thread instance for the sake of proxying later classes.
     */
    var thread = new Thread({
      enableWebWorkers: (/forcemultithread/.test(window.location.search))
    });


    /**
     * Console.log safety wrapper.
     */
    function log() {
      try {
        console.log.apply(console, arguments);
      } catch(e) {}
    }


    /**
     * Console.error safety wrapper.
     */
    function error() {
      try {
        console.error.apply(console, arguments);
      } catch(e) {}
    }


    /**
     * The CacheManifest handles recording and persisting arbitrary keys.
     * Our particular use case for the CacheManifest in Mirage is to keep track
     * of the list of image URLs likely to be hot in cache.
     * @constructor
     */
    var CacheManifest = function CacheManifest() {
      this.queue_ = q.ref();
      this.reset_();
    };
    // Instrumentation..
    CacheManifest = profiler.spyOnClass(CacheManifest, 'CacheManifest');
    CacheManifest.timeConstructor(['storage']);


    /**
     * @type {Number} The default TTL for cached items.
     * @static
     */
    CacheManifest.DEFAULT_TTL = 48 * 60 * 60 * 1000;


    /**
     * @type {String} The default storage key for the persisted manifest.
     * @static
     */
    CacheManifest.STORAGE_KEY = 'mirage_cache_manifest';


    /**
     * @type {Number} The debounce threshold for storage write operAations.
     * @static
     */
    CacheManifest.DEBOUNCE_THRESHOLD = 500;


    /**
     * @type {Number} The maximum number of items that the manifest will track.
     * @static
     */
    CacheManifest.MAX_LENGTH = 100;


    /**
     * @param {String} key A key to be recorded.
     * @return {Promise} A promise that resolves when the key is recorded.
     */
    CacheManifest.prototype.record = function(key) {
      return this.whenReady_(function() {
        this.add_(key);
        this.persist_();
      });
    };
    // Instrumentation..
    CacheManifest.timePromisedMethod('record', ['storage']);


    /**
     * @param {String} key A key to lookup in the cache.
     * @return {Promise<Boolean>} A promise that resolves with true if the key
     * is in the cache.
     */
    CacheManifest.prototype.has = function(key) {
      return this.whenReady_(function() {
        return this.has_(key);
      });
    };
    // Instrumentation..
    CacheManifest.timePromisedMethod('has', ['storage']);


    /**
     * @param {String} key A key to get the chronological index for, as
     * recorded by the cache.
     * @return {Promise<Number>} A promise that resolves an integar index, or
     * -1 if the item is not in the cache.
     */
    CacheManifest.prototype.indexOf = function(key) {
      return this.whenReady_(function() {
        return this.indexOf_(this.map_[key]);
      });
    };


    /**
     * @return {Promise} A promise that resolves when the cache has been
     * cleared.
     */
    CacheManifest.prototype.clear = function() {
      return this.whenReady_(function() {
        try {
          window.localStorage.removeItem(CacheManifest.STORAGE_KEY);
        } catch(e) {}

        this.reset_();
      });
    };
    // Instrumentation..
    CacheManifest.timePromisedMethod('clear', ['storage']);


    /**
     * @param {Function} operation An operation to be queued to run when all
     * previously queued operations are completed.
     * @return {Promise} A promise that resolves when the queued operation
     * completes.
     * @private
     */
    CacheManifest.prototype.whenReady_ = function(operation) {
      this.queue_ = this.queue_.then(bind(operation, this));
      return this.queue_;
    };


    /**
     * @param {String} key The key to lookup.
     * @return {Boolean} True if the key is in cache.
     * @private
     */
    CacheManifest.prototype.has_ = function(key) {
      var created = this.map_[key];
      var now = util.now();

      if (created && (created + CacheManifest.DEFAULT_TTL) < now) {
        this.remove_(key);
        this.persist_();
        return false;
      }

      return !!created;
    };


    /**
     * @return {Promise} A promise that resolves when the cache has been
     * reset from storage.
     */
    CacheManifest.prototype.reset_ = function() {
      return this.whenReady_(function() {
        try {
          this.map_ = JSON.parse(
              window.localStorage.getItem(CacheManifest.STORAGE_KEY));

          this.sizeMap_ = {};
          this.sizeQueue_ = iter.map(this.map_, function(value, key) {
            var object = {
              key: key,
              value: value
            };
            this.sizeMap_[key] = object;
            return object;
          }, this).sort(function(a, b) {
            if (a.value > b.value) {
              return -1;
            } else if (a.value < b.value) {
              return 1;
            }

            return 0;
          });
        } catch(e) {}

        this.map_ = this.map_ || {};
        this.offset_ = 0;
      });
    };
    // Instrumentation..
    CacheManifest.timePromisedMethod('reset_', ['storage']);


    /**
     * Find the chronological index of an item stored in the manifest.
     * @param {Number} value The last recorded time of the item.
     * @param {Number=} lowerIndex An optional lower index for the search.
     * @param {Number=} upperIndex An optional upperIndex for the search.
     * @return {Number} The chronological index of the item in the manifest, or
     * -1 if the item is not found.
     * @private
     */
    CacheManifest.prototype.indexOf_ = function(value, lowerIndex, upperIndex) {
      var range;
      var mid;

      if (this.sizeQueue_.length === 0 || typeof value === 'undefined') {
        return -1;
      }

      lowerIndex = lowerIndex || 0;
      upperIndex = upperIndex || this.sizeQueue_.length;

      range = upperIndex - lowerIndex;

      if (range === 0) {
        return -1;
      }

      mid = range / 2 + lowerIndex;
      mid |= mid;

      if (this.sizeQueue_[mid].value < value) {
        return this.indexOf_(value, lowerIndex, mid);
      } else if (this.sizeQueue_[mid].value > value) {
        return this.indexOf_(value, mid, upperIndex);
      }

      return mid;
    };


    /**
     * Updates the value of an item in memory to 'now.' Creates the item if
     * it does not exist. Removes an item of the max size is exceeded.
     * @param {String} key The name of the cached item.
     * @private
     */
    CacheManifest.prototype.add_ = function(key) {
      var target = this.sizeMap_[key];
      var index;

      if (target) {
        index = this.indexOf_(target.value);
        this.sizeQueue_.splice(index, 1);
      } else {
        target = {
          key: key
        };
        this.sizeMap_[key] = target;
      }

      this.map_[key] = target.value = util.now() + this.offset_++;
      this.sizeQueue_.unshift(target);

      if (this.sizeQueue_.length > CacheManifest.MAX_LENGTH) {
        this.remove_(this.sizeQueue_[this.sizeQueue_.length - 1].key);
      }
    };


    /**
     * Removes an item from the in-memory cache.
     * @param {String} key The name of the item to remove.
     * @private
     */
    CacheManifest.prototype.remove_ = function(key) {
      var target = this.sizeMap_[key];
      var index = this.indexOf_(target.value);

      delete this.map_[key];
      delete this.sizeMap_[key];

      if (index !== -1) {
        this.sizeQueue_.splice(index, 1);
      }
    };


    /**
     * @return {Promise} A promise that resolves when the cache has been
     * persisted to storage.
     */
    CacheManifest.prototype.persist_ = function() {
      return this.whenReady_(function() {
        try {
          window.localStorage.setItem(CacheManifest.STORAGE_KEY,
                                      JSON.stringify(this.map_));
        } catch(e) {}
      });
    };
    // Instrumentation..
    CacheManifest.timePromisedMethod('persist_', ['storage']);
    // Debounce after instrumentation..
    CacheManifest.prototype.persist_ =
        debounce(CacheManifest.prototype.persist_,
                 CacheManifest.DEBOUNCE_THRESHOLD);



    /**
     * The NetworkConnection class abstracts connection details occassionally
     * available in the DOM. The class attempts to use the navigator.connection
     * property, and falls back to performing a contrived speed test. If
     * localStorage is not available, infinite bandwidth is reported.
     * @constructor
     * @see https://developer.mozilla.org/en-US/docs/WebAPI/Network_Information
     */
    var NetworkConnection = function NetworkConnection() {
      var canAccessStorage = false;
      var storageTestKey = '___MIRAGE_STORAGE_TEST___';

      try {
        localStorage.setItem(storageTestKey, storageTestKey);
        localStorage.getItem(storageTestKey);
        localStorage.removeItem(storageTestKey);

        canAccessStorage = true;
      } catch(e) {}

      this.canAccessStorage_ = canAccessStorage;

      this.connectionResolves_ = q.ref().then(bind(function() {
        this.connection_ = navigator.connection ||
          navigator.mozConnection ||
          navigator.webkitConnection;

        if (this.connection_) {
          return this.connection_;
        }

        return this.getFakeConnection_();
      }, this));
    };
    // Instrumentation..
    NetworkConnection = profiler.spyOnClass(NetworkConnection, 'NetworkConnection');
    NetworkConnection.timeConstructor(['storage', 'network']);


    /**
     * @type {String} The key used to cache network connection info in storage.
     * @static
     */
    NetworkConnection.STORAGE_KEY = 'mirage_network_connection';


    /**
     * @type {Number} Scalar used to convert from B/ms to MB/s.
     * @static
     */
    NetworkConnection.MEGABYTE_RATIO = 1048.576;


    /**
     * @type {String} Name of header to read for server time when approximating
     * connection speed.
     * @static
     */
    NetworkConnection.SERVER_TIME_HEADER = 'X-Mirage-Server-Time';


    /**
     * @type {String} Name of header to read for transfer size when
     * approximating connection speed.
     * @static
     */
    NetworkConnection.TRANSFER_SIZE_HEADER = 'X-Mirage-Transfer-Size';


    /**
     * @type {String} This represents the location associated with the
     * speedtest fallback request made when the NetworkInformation API is
     * not available.
     * @static
     */
    NetworkConnection.SPEEDTEST_LOCATION_FRAGMENT =
        '/cdn-cgi/mirage_speedtest/';


    /**
     * @type {Object} A default connection to use when a connection is
     * otherwise unobtainable.
     * @static
     */
    NetworkConnection.DEFAULT_CONNECTION = {
      bandwidth: Infinity,
      metered: null
    };


    /**
     * @type {Number} The threshold (in MB/s) underwhich measured bandwidth
     * should be (arbitrarily) considered to have high latency.
     */
    NetworkConnection.HIGH_LATENCY_THRESHOLD = 10 / 8;


    /**
     * @return {Promise<Boolean>} A promise that resolves true if the client
     * should be considered to be experiencing high latency.
     */
    NetworkConnection.prototype.assessLatency = function() {
      return this.connectionResolves_.then(function(connection) {
        var ua = window.navigator.userAgent || '';
        var lowBandwidth =
            connection.bandwidth < NetworkConnection.HIGH_LATENCY_THRESHOLD;
        var candidateUserAgent = /Android|iPhone|iPod|iPad/.test(ua);

        return lowBandwidth && candidateUserAgent;
      });
    };
    // Instrumentation..
    NetworkConnection.timePromisedMethod('assessLatency', ['network']);


    /**
     * @return {Promise<Object>} A promise that resolves with a connection-like
     * object of the form { bandwidth: Number, metered: Boolean }.
     * @private
     * @see https://developer.mozilla.org/en-US/docs/WebAPI/Network_Information
     */
    NetworkConnection.prototype.getFakeConnection_ = function() {
      return q.ref().then(bind(function() {
        var connection;

        if (!this.canAccessStorage_) {
          return NetworkConnection.DEFAULT_CONNECTION;
        }

        try {
          connection = JSON.parse(
              window.localStorage.getItem(NetworkConnection.STORAGE_KEY));
        } catch(e) {}

        if (connection) {
          return connection;
        }

        return this.approximateConnection_().then(function(connection) {
          try {
            window.localStorage.setItem(NetworkConnection.STORAGE_KEY,
                                        JSON.stringify(connection));
          } catch(e) {}

          return connection;
        }, function() {
          return NetworkConnection.DEFAULT_CONNECTION;
        });
      }, this));
    };
    // Instrumentation..
    NetworkConnection.timePromisedMethod('getFakeConnection_',
                                         ['storage', 'network']);


    /**
     * Performs a connection test that allows for data to be gathered, which
     * in turn are used to approximate the current connection speed.
     * @return {Promise<Object>} A promise that resolves with a connection-like
     * object.
     * @private
     */
    NetworkConnection.prototype.approximateConnection_ = function() {
      var xhr = new XMLHttpRequest();
      var startTime = util.now();
      var url = origin + NetworkConnection.SPEEDTEST_LOCATION_FRAGMENT +
          startTime;
      var result = q.defer();

      log('Approximating network connection..');

      xhr.open('get', url);

      xhr.onreadystatechange = function() {
        try {
          if (xhr.status > 299) {
            return result.reject();
          }
        } catch(e) {}

        if (xhr.readyState === 4) {

          if ( xhr.status == 200 ) {
            var currentTime = util.now();
            var serverTime = window.parseInt(
                xhr.getResponseHeader(NetworkConnection.SERVER_TIME_HEADER),
                10);
            var responseSize = window.parseInt(
              xhr.getResponseHeader(NetworkConnection.TRANSFER_SIZE_HEADER),
              10);
            var time = currentTime - startTime;
            var speed = parseFloat((responseSize / time /
                                  NetworkConnection.MEGABYTE_RATIO).toFixed(2));

            if (isNaN(serverTime) || isNaN(serverTime)) {
              result.resolve(NetworkConnection.DEFAULT_CONNECTION);
              return;
            }

            log('Upstream:', serverTime - startTime, 'ms');
            log('Downstream:', currentTime - serverTime, 'ms');
            log('Round-trip:', time, 'ms');
            log('Transferred:', responseSize, 'bytes');
            log('Speed:', speed, ' MB/s');

            result.resolve({
              bandwidth: speed,
              metered: null
            });
          }
          else {
            result.reject(e);
          }
        }
      };
      xhr.send();
      return result.promise;
    };
    // Instrumentation..
    NetworkConnection.timePromisedMethod('approximateConnection_',
                                         ['async', 'network']);



    var PNGChunk = thread.createProxy('PNGChunk', function(log, error) {
      /**
       * The PNGChunk class is used to parse an individual chunk of a binary
       * PNG buffer.
       * @constructor
       * @param {ArrayBuffer} buffer The buffer that contains the chunk.
       * @param {Number} offset The byte index of the chunk in the buffer.
       */
      var PNGChunk = function PNGChunk(buffer, offset) {
        try {
          var uint8View = new Uint8Array(buffer, offset);
          if (uint8View[0] === PNGChunk.type.SIGNATURE[0]) {
            this.initializeAsSignature_(buffer, offset);
          } else {
            this.initializeAsChunk_(buffer, offset);
          }
        } catch(e) {
          throw new Error('Failed to initialize a PNG chunk. ' + e.toString());
        }
      };


      /**
       * @enum {Array} Various important chunk types, for matching.
       */
      PNGChunk.type = {
        SIGNATURE: [ 137, 80, 78, 71, 13, 10, 26, 10 ],
        IHDR: [ 73, 72, 68, 82 ],
        IEND: [ 73, 69, 78, 68 ]
      };


      /**
       * @type {Number} The basal combined lenght of chunk fields.
       * @static
       */
      PNGChunk.FIELD_BYTE_LENGTH = 12;


      /**
       * Initializes this chunk as a signature chunk.
       * @param {ArrayBuffer} buffer The buffer that contains this chunk.
       * @param {Number} offset The byte index of the chunk in the buffer.
       * @private
       */
      PNGChunk.prototype.initializeAsSignature_ = function(buffer, offset) {
        this.byteLength = 8;
        this.type_ = new Uint8Array(buffer, offset, this.byteLength);
      };


      /**
       * Initializes this chunk as a normal chunk.
       * @param {ArrayBuffer} buffer The buffer that contains this chunk.
       * @param {Number} offset The byte index of the chunk in the buffer.
       * @private
       */
      PNGChunk.prototype.initializeAsChunk_ = function(buffer, offset) {
        var lengthView = new Uint8Array(buffer, offset, 4);
        var byteLength = 0;

        for (var byteIndex = 0; byteIndex < 4; byteIndex++) {
          byteLength <<= 8;
          byteLength |= lengthView[byteIndex];
        }

        this.byteLength = byteLength + PNGChunk.FIELD_BYTE_LENGTH;
        this.type_ = new Uint8Array(buffer, offset + 4, 4);
      };


      /**
       * @return {Boolean} True if this chunk is a signature chunk.
       */
      PNGChunk.prototype.isSignature = function(){
        return this.byteLength === 8;
      };


      /**
       * @return {Boolean} True if this chunk is a header chunk.
       */
      PNGChunk.prototype.isHeader = function() {
        return this.matches(PNGChunk.type.IHDR);
      };


      /**
       * @return {Boolean} True if this chunk is an end chunk.
       */
      PNGChunk.prototype.isEnd = function() {
        return this.matches(PNGChunk.type.IEND);
      };


      /**
       * @param {Array} type A reference type field to compare to.
       * @return {Boolean} True if this chunk's type field matches the passed
       * type field.
       */
      PNGChunk.prototype.matches = function(type) {
        for (var i = 0; i < type.length; ++i) {
          if (this.type_[i] !== type[i]) {
            return false;
          }
        }
        return true;
      };

      return PNGChunk;
    });
    // Instrumentation..
    PNGChunk = profiler.spyOnClass(PNGChunk, 'PNGChunk');
    PNGChunk.timeConstructor(['buffer', 'parse', 'png', 'chunk']);
    PNGChunk.timeMethod('matches', ['buffer', 'parse', 'png', 'chunk']);



    var PNGImage = thread.createProxy('PNGImage', function(log, error) {
      /**
       * Parses a PNGImage out of a provided buffer.
       * @constructor
       * @param {ArrayBuffer} buffer The buffer that contains the image.
       * @param {Number} offset The byte index of the image in the buffer.
       */
      var PNGImage = function PNGImage(buffer, offset) {
        var chunk = new PNGChunk(buffer, offset);
        var byteLength = 0;

        assert(chunk.isSignature(), 'First chunk should be PNG signature.');

        byteLength += chunk.byteLength;

        do {
          chunk = new PNGChunk(buffer, offset + byteLength);
          byteLength += chunk.byteLength;
        } while (!chunk.isEnd());

        this.offset = offset;
        this.byteLength = byteLength;
        this.view = new Uint8Array(buffer, offset, byteLength);
        this.imageSrc_ = null;
      };


      /**
       * A mechanism for creating ObjectURL instances, with enforced synchronous
       * queueing.
       * @static
       * @param {PNGImage} pngImage The PNGImage instance to turn into an
       * object URL.
       * @return {Promise<ObjectURL>} A promise that resolves with an ObjectURL
       * suitable for use as the value for an img-tag src attribute.
       * @see https://developer.mozilla.org/en-US/docs/DOM/window.URL.createObjectURL
       */
      PNGImage.createObjectUrl = (function() {
        var queue = q.ref();
        return function(pngImage) {
          queue = queue.then(function() {
            var blob = pngImage.toBlob_();

            pngImage.releaseImageSrc();

            try {
              var createObjectURL = 'createObjectURL';

              // safari wat
              for (createObjectURL in url) {
                if (createObjectURL === 'createObjectURL') break;
              }

              return url[createObjectURL](blob);
            } catch(e) {
              error('Failed to create objectURL for a blob.', e.message);
              return '';
            }
          });
          return queue;
        };
      })();


      /**
       * @return {Blob} A blob instance representing the PNG Image.
       * @private
       * @see https://developer.mozilla.org/en-US/docs/DOM/Blob
       */
      PNGImage.prototype.toBlob_ = function() {
        // Note: Safari as of 6.0.4 does not support using an ArrayBufferView as
        // a part for the Blob constructor.
        var buffer = arrayBufferSlice(this.view.buffer,
                                      this.view.byteOffset,
                                      this.view.byteOffset + this.view.byteLength);


        return createBlob(buffer, { type: 'image/png' });
      };


      /**
       * @return {Promise<ObjectURL>} A promise that resolves with an ObjectURL
       * suitable for use as the value of an img-tag src attribute.
       */
      PNGImage.prototype.resolveImageSrc = function() {
        return PNGImage.createObjectUrl(this).then(bind(function(src) {
          this.imageSrc_ = src;
          return src;
        }, this));
      };


      /**
       * Attempts to revoke the most recently created ObjectURL for this
       * PNGImage instance.
       * @see https://developer.mozilla.org/en-US/docs/Using_files_from_web_applications#Using_objectURLs
       */
      PNGImage.prototype.releaseImageSrc = function() {
        if (!this.imageSrc_) {
          return;
        }

        try {
          url.revokeObjectURL(this.imageSrc_);
          this.imageSrc_ = null;
        } catch(e) {
          error('Failed to release image src.', e.message);
        }
      };


      return PNGImage;
    });
    // Instrumentation..
    PNGImage = profiler.spyOnClass(PNGImage, 'PNGImage');
    PNGImage.timeConstructor(['buffer', 'parse', 'png', 'image']);
    PNGImage.timeStaticMethod('createObjectUrl',
                              ['png', 'image', 'blob', 'url']);
    PNGImage.timeMethod('toBlob_', ['png', 'image', 'blob', 'buffer']);
    PNGImage.timeMethod('releaseImageSrc',
                        ['png', 'image', 'blob', 'url']);



    var MirageImageJSON = thread.createProxy(
        'MirageImageJSON', function(log, error) {
      /**
       * The MirageImageJSON class handles chunking the preamble JSON metadata
       * out of the full buffer.
       * @constructor
       * @param {ArrayBuffer} buffer The buffer containing the JSON preamble.
       * @param {Number} offset The byte index of the JSON in the buffer.
       */
      var MirageImageJSON = function MirageImageJSON(buffer, offset) {
        var lengthView = new Uint8Array(buffer, offset, 4);
        var byteLength = 0;
        var data;

        for (var byteIndex = 0; byteIndex < 4; byteIndex++) {
          byteLength <<= 8;
          byteLength |= lengthView[byteIndex];
        }

        try {
          data = String.fromCharCode.apply(
              null, new Uint8Array(buffer, offset + 4, byteLength));
          data = JSON.parse(data);
        } catch(e) {
          throw new Error('Unable to parse degraded image JSON. ' +
                          e.toString());
        }

        this.byteLength = byteLength + 4;
        this.data = data;

        this.loadStatus = (this.data.status == MirageImageJSON.state.LOAD_OK ?
                           this.data.status :
                           this.data.status + ":" + this.data.cache_status);

        this.data.width = this.data.width || this.data.X || 0;
        this.data.height = this.data.height || this.data.Y || 0;

      };

      /**
       * @enum {String} An enumeration of MirageImageJSON server return states.
       */

      MirageImageJSON.state = {
          LOAD_OK: 'ok',
          CACHE_MISS: '914:MISS',
          CACHE_HIT: '914:HIT'
      };

      return MirageImageJSON;
    });
    // Instrumentation..
    MirageImageJSON = profiler.spyOnClass(MirageImageJSON, 'MirageImageJSON');
    MirageImageJSON.timeConstructor(['json', 'buffer']);

    var MirageDegradedImage = thread.createProxy(
        'MirageDegradedImage', function(log, error) {
      /**
       * A MirageDegradedImage is distinct from a normal PNGImage in that it has
       * been padded with JSON meta-data.
       * @constructor
       * @param {ArrayBuffer} buffer The buffer containing the degraded image.
       * @param {Number} offset The byte index of the image in the buffer.
       */
      var MirageDegradedImage = function MirageDegradedImage(buffer, offset) {
        this.json = new MirageImageJSON(buffer, offset);
        this.png = new PNGImage(buffer, offset + this.json.byteLength);
        this.src = this.json.data.url;
        this.width = this.json.data.width || this.json.data.Y;
        this.height = this.json.data.height || this.json.data.X;
        this.byteLength = this.json.byteLength + this.png.byteLength;
      };

      /**
       * @return {Promise<String>} A promise that resolves a string suitable as
       * an image src value.
       */
      MirageDegradedImage.prototype.resolveSrc = function() {
        return this.png.resolveImageSrc();
      };

      /**
       * @return {Boolean} True if the degraded image is returned from the server.
       */
      MirageDegradedImage.prototype.isValid = function() {
        return (this.json.loadStatus == MirageImageJSON.state.LOAD_OK);
      };

      return MirageDegradedImage;
    });
    // Instrumentation..
    MirageDegradedImage = profiler.spyOnClass(
        MirageDegradedImage, 'MirageDegradedImage');
    MirageDegradedImage.timeConstructor(['image', 'json', 'buffer']);



    var MirageDegradedImageFallback = thread.createProxy(
        'MirageDegradedImageFallback', function(log, error) {
      /**
       * The MirageDegradedImageFallback class is a drop-in replacement for
       * MirageDegradedImage. It is intended to handle cases when the client
       * cannot create its own DataURLs.
       * @constructor
       * @param {String} body The string containing the degraded image.
       * @param {Number} offset The string index of the degraded image.
       */
      var MirageDegradedImageFallback =
          function MirageDegradedImageFallback(body, offset) {

        var jsonEndIndex = body.indexOf('}\n', offset) + 1;
        var dataUrlEndIndex = body.indexOf('\n\n', jsonEndIndex);

        assert(jsonEndIndex !== -1, 'A JSON boundary should exist.');
        assert(dataUrlEndIndex !== -1, 'A DataURL boundary should exist.');

        var json = JSON.parse(body.slice(offset, jsonEndIndex));
        var dataUrl = body.slice(jsonEndIndex + 1, dataUrlEndIndex);

        this.json = {
          data: json,
          loadStatus : (json.status == MirageImageJSON.state.LOAD_OK ?
                        json.status :
                        json.status + ":" + json.cache_status)
        };

        this.src = this.json.data.url;
        this.width = this.json.data.width || this.json.data.X;
        this.height = this.json.data.height || this.json.data.Y;

        this.stringLength = dataUrlEndIndex + 2 - offset;

        this.dataUrl_ = dataUrl;
      };


      /**
       * @return {Promise<String>} A promise that resolves a string suitable as
       * an image src value.
       */
      MirageDegradedImageFallback.prototype.resolveSrc = function() {
        return q.ref(this.dataUrl_);
      };


      /**
       * @return {Boolean} True if the base64 image is returned from the server.
       */
      MirageDegradedImageFallback.prototype.isValid = function() {
        return (this.json.loadStatus == MirageImageJSON.state.LOAD_OK);
      };


      return MirageDegradedImageFallback;
    });
    // Instrumentation..
    MirageDegradedImageFallback = profiler.spyOnClass(
        MirageDegradedImageFallback, 'MirageDegradedImageFallback');
    MirageDegradedImageFallback.timeConstructor(['image', 'json', 'buffer']);



    /**
     * A MirageImage is a controller that manipulates image nodes on the page.
     * @constructor
     * @param {HTMLImageElement} image The image to be wrapped by the
     * MirageImage instance.
     */
    var MirageImage = function(image, config) {
      this.image_ = image;
      this.restored_ = false;
      this.restoring_ = false;
      this.stateCallback_ = null;
      this.restoredResult_ = q.defer();
      this.wrappedPropertyCache_ = [];
      this.boundExpireState_ = bind(this.expireState_, this);
      this.parentTree_ = MirageImage.resolveParentTree(this.image_);
      this.parentTreeChangesPromise_ = null;
      this.parentTreeCheckInterval_ = null;
      this.forcePreloadOnly_ = config && config.forcePreloadOnly_;
      this.requireProxy_ = config && config.proxy_;
      this.storeStyleMutation();
      this.makeMeasurable_();
      this.wrap_();
    };
    // Instrumentation..
    MirageImage = profiler.spyOnClass(MirageImage);
    MirageImage.timeConstructor(['image']);


    /**
     * @type {Number} A pixel buffer within which images are assumed to be
     * entering the viewport.
     * @static
     */
    MirageImage.VIEWPORT_BUFFER = 300;


    /**
     * @type {Number} The interval at which to poll for parent tree changes.
     * @static
     */
    MirageImage.PARENT_TREE_POLL_INTERVAL = 500;


    /**
     * @type {Number} The initial retry delay for testing if an image is within the viewport
     * @static 
     */
    MirageImage.RETRY_TIME = 100;

    /**
     * @type {String} The name of the class which sets visibility hidden.
     * @static
     */
    MirageImage.INVISIBLE_CLASS = 'cf-invisible';

    /**
     * @type {String} The name of the class which sets display none.
     * @static
     */
    MirageImage.HIDDEN_CLASS = 'cf-hidden';

    /**
     * @param {Node} node A DOM node.
     * @return {Array} An array of DOM nodes representing the parent tree.
     * @static
     */
    MirageImage.resolveParentTree = function(node) {
      var tree = [];
      var target = node;

      while (target) {
        tree.push(target);

        try {
          target = target.parentNode;
        } catch(e) {
          break;
        }
      }

      return tree;
    };


    /**
     * @param {Node} node A DOM node.
     * @param {Array} tree An array of DOM nodes representing a parent tree.
     * @return {Boolean} True if the tree of node matches the provided tree.
     * @static
     */
    MirageImage.matchesParentTree = function(image, tree) {
      var newTree = MirageImage.resolveParentTree(image);

      if (newTree.length !== tree.length) {
        return false;
      }

      for (var i = 0; i < newTree.length; ++i) {
        if (newTree[i] !== tree[i]) {
          return false;
        }
      }

      return true;
    };


    /**
     * Inspect the image to see if the style attribute has been changed before the MirageImage is captured.
     * If the style has been changed add it to cfstyle. 
     */

    MirageImage.prototype.storeStyleMutation  = function() {

      var storedStyle = dom.getData(this.image_, 'cfstyle');

      if (this.image_.style.visibility === 'hidden') {
        this.image_.style.visibility = '';
        changedStyle = dom.getAttribute(this.image_, 'style');
      }

      if (this.image_.style.display === 'none') {
        this.image_.style.display = '';
        changedStyle = dom.getAttribute(this.image_, 'style');
      }

      var changedStyle = dom.getAttribute(this.image_, 'style');
      if (!changedStyle) {
        return;
      }

      if ( !storedStyle ) {
        dom.setData(this.image_, 'cfstyle', changedStyle);
      }
      else {
        dom.setData(this.image_, 'cfstyle', MirageImage.mergeInlineStyles(this.image_));
      }

    };


    /**
     * @return {String} A css declaration list conatining the inline styles and the style stored in data-cfstyle
     * @static
     */
    MirageImage.mergeInlineStyles  = function(imgNode) {

      var changedStyle = dom.getAttribute(imgNode, 'style');
      var storedStyle = dom.getData(imgNode, 'cfstyle');

      var cfStyle = {};
      var cssDeclarationList = storedStyle.split(";").concat(changedStyle.split(";"));

      iter.forEach(cssDeclarationList,
        function(cssDeclaration) {
          cssDec = cssDeclaration.split(":");
          cfStyle[cssDec[0].trim()] = cssDeclaration;
        }
      );

      var cfStyleList = [];
      for (var cssDec in cfStyle) {
        if (!!cssDec) {
          cfStyleList.push(cfStyle[cssDec]);
        }
      }

      return cfStyleList.join(";");

    };

    /**
     * @return {Boolean} True if the image is a valid candidate for loading
     * via the Mirage optimization pipeline.
     * @static
     */
    MirageImage.isValidCandidate = function(node) {
      var cfsrc = dom.getData(node, 'cfsrc');
      var src = dom.getAttribute(node, 'src');

      var storedStyle = dom.getData(node, 'cfstyle');
      var changedStyle = dom.getAttribute(node, 'style');

      if (cfsrc && cfsrc.slice(0, 5).toLowerCase() === "data:") {
        dom.setAttribute(node, 'src', cfsrc);
        MirageImage.restoreStyle(node);
        return false;
      }

      if (!!src && cfsrc !== src) {
        MirageImage.restoreStyle(node);
      }
      return node.nodeName === 'IMG' && !!cfsrc  && ((src === null) ||  (src === "") || (src === cfsrc));
    };


    /**
     * For an invalid mirage image candidate remove the hidden styles and 
     * merge any otehr styles that have been set with the original styles.
     * @static
     */
    MirageImage.restoreStyle = function(node) {

      var storedStyle = dom.getData(node, 'cfstyle');
      var changedStyle;

      if (node.style) {
        node.style.visibility = '';
        node.style.display = '';
      }

      changedStyle = dom.getAttribute(node, 'style');

      if (storedStyle ) {
        if (!changedStyle) {
          dom.setAttribute(node, 'style', storedStyle);
        }
        else {
          dom.setAttribute(node, 'style', MirageImage.mergeInlineStyles(node));
        }
      }
      else {
        dom.removeAttribute(node, 'style');
      }

    };


    /**
     * @return {String} The canonical src associated with the original image
     * tag, if any.
     */
    MirageImage.prototype.getSrc = function() {
      return path.resolveFullURL(dom.getData(this.image_, 'cfsrc') || '');
    };
    // Instrumentation..
    MirageImage.timeMethod('getSrc', ['image', 'url', 'regex']);


    /**
     * @return {String} The canonical style attribute value associated with the
     * original image tag, if any.
     */
    MirageImage.prototype.getStyle = function() {
      return dom.getData(this.image_, 'cfstyle') || '';
    };
    // Instrumentation..
    MirageImage.timeMethod('getStyle', ['image', 'data', 'dom']);


    /**
     * @return {Number} The offset top position of the image.
     */
    MirageImage.prototype.getTop = function() {
      var top = 0;
      var target = this.image_;

      while (target) {
        try {
          if (typeof target.offsetTop !== 'undefined' && target.offsetTop) {
            top += target.offsetTop;
          }
          target = target.offsetParent;
        } catch(e) {
          break;
        }
      }

      return top;
    };
    // Instrumentation..
    MirageImage.timeMethod('getTop', ['image', 'measurement', 'dom']);


    /**
     * @return {Number} The offset left position of the image.
     */
    MirageImage.prototype.getLeft = function() {
      var img = this.image_;
      return img.getBoundingClientRect().left;
    };
    // Instrumentation..
    MirageImage.timeMethod('getLeft', ['image', 'measurement', 'dom']);


    /**
     * @param {String} url A src value representing a degraded version
     * of an image.
     * @return {Promise} A promise that resolves when the degraded image
     * has been fully loaded.
     */
    MirageImage.prototype.setDegradedSrc = function(url) {
      var result = q.defer();
      if (!this.restored_) {
        this.restoring_ = true;
        this.unwrap_();
        this.restoring_ = false;

        this.whenStateExpires_(bind(function() {
          profiler.mark("Image has been restored.");
          result.resolve();
        }, this));

        dom.setAttribute(this.image_, 'src', url);
        this.image_.src = url;
        if (this.getStyle() === "") {
          dom.removeAttribute(this.image_, 'style');
        }
        else {
          dom.setAttribute(this.image_, 'style', this.getStyle());
        }
        classes.remove(this.image_, MirageImage.HIDDEN_CLASS);

        this.wrap_();

      } else {
        result.resolve();
      }

      return result.promise;
    };
    // Instrumentation..
    MirageImage.timePromisedMethod('#setDegradedSrc', ['image', 'dom', 'async']);

    /**
     * Restores the image to it's original state if it within the viewport.
     */
    MirageImage.prototype.restoreWithinViewport = function() {

      if (this.forcePreloadOnly_)
        return this.restoredResult_.promise;
      if (!mirageConfig.eagerLoad) {
        return this.entersViewport_().then(bind(function() {
          return this.restore();
        }, this));
      }
      else {
        return this.restore();
      }
    };

    MirageImage.timePromisedMethod('restoreWithinViewport', ['image', 'dom']);

    /**
     * Restores the image to it's original state.
     */
    MirageImage.prototype.restore = function() {

      if (this.forcePreloadOnly_)
        return this.restoredResult_.promise;

      this.restoring_ = true;
      this.unwrap_();
      this.restoring_ = false;
      this.restored_ = true;

      dom.setAttribute(this.image_, 'src', this.getSrc());
      this.image_.src = this.getSrc();
 
      if (this.getStyle() === "") {
        dom.removeAttribute(this.image_, 'style');
      }
      else {
        dom.setAttribute(this.image_, 'style', this.getStyle());
      }
      classes.remove(this.image_, MirageImage.HIDDEN_CLASS);

      this.whenStateExpires_(bind(function() {
        this.restoredResult_.resolve();
      }, this));

      return this.restoredResult_.promise;

    };
    // Instrumentation..
    MirageImage.timePromisedMethod('restore', ['image', 'dom']);


    /**
     * Registers a callback to be called when the image is restored.
     * @param {Function} callback The callback to be called when the image is
     * restored.
     * @return {Promise} A promise that resolves when the callback has been
     * called.
     */
    MirageImage.prototype.whenRestored = function(callback) {
      return this.restoredResult_.promise.then(callback);
    };


    /**
     * @return {Boolean} True if the image is located within the a specified
     * distance of the viewport of the client screen.
     * @param {} 
     */
    MirageImage.prototype.isWithinViewport = function() {

      var viewport = dom.getViewport();
      var distance;
      var target = this.image_;
      var imageRect = target.getBoundingClientRect();

      if (imageRect.bottom < 0) {
        distance = imageRect.bottom;
      } else if (imageRect.top > viewport.height) {
        distance = imageRect.top - viewport.height;
      } else {
        distance = 0;
      }

      return (Math.abs(distance)< MirageManager.DISTANCE_FROM_VIEWPORT);
    };


    /**
     * @param {Function} callback A callback to be called when the loading
     * state of the current image changes.
     * @private
     */
    MirageImage.prototype.whenStateExpires_ = function(callback) {
      this.expireState_();
      this.stateCallback_ = callback;
      dom.addEventListener(this.image_, 'load', this.boundExpireState_);
      dom.addEventListener(this.image_, 'error', this.boundExpireState_);
    };


    /**
     * Expires the current loading state of the image.
     * @private
     */
    MirageImage.prototype.expireState_ = function() {
      var callback;
      dom.removeEventListener(this.image_, 'load', this.boundExpireState_);
      dom.removeEventListener(this.image_, 'error', this.boundExpireState_);
      if (this.stateCallback_) {
        callback = this.stateCallback_;
        this.stateCallback_ = null;
        callback();
      }
    };


    /**
     * @return {Promise} A promise that resolves when the image enters the
     * viewport.
     * @private
     */
    MirageImage.prototype.entersViewport_ = function() {

      if (this.isWithinViewport()) {
        return q.ref();
      }

      var result = q.defer();

      var handler = bind(function() {
        if (this.isWithinViewport()) {
          if (this.parentTreeCheckInterval_ !== null) {
            window.clearInterval(this.parentTreeCheckInterval_);
            this.parentTreeCheckInterval_ = null;
          }
          this.mutationObserver.disconnect();
          if (this.retryTimer_) {
            delete this.retryTimer_;
          }

          dom.removeEventListener(window, 'resize', handler);
          dom.removeEventListener(window, 'scroll', handler);
          result.resolve();
        }
      }, this);

      this.retryTimer_ = setTimeout(bind(function() {
        handler();}, this),
      MirageImage.RETRY_TIME);

      this.parentTreeChanges_().then(handler);
      this.elementAttributeChange_().then(handler);

      dom.addEventListener(window, 'resize', handler);
      dom.addEventListener(window, 'scroll', handler);

      return result.promise;
    };


    /**
     * @return {Promise} A promise that resolves when an attribute 
     * of the image changes.
     * @private
     */

    MirageImage.prototype.elementAttributeChange_ = function() {

      var result = q.defer();

      var MutationObserver = (function() {
        return window.MutationObserver ||
               window.WebKitMutationObserver ||
               window.MozMutationObserver || function() {
                 this.observe = function(){},
                 this.disconnect = function(){};
               };
      })();

      this.mutationObserver = new MutationObserver(function(mutations) {
          result.resolve();
      });


      if (this.image_.origImage_) {
        this.mutationObserver.observe(this.image_.origImage_, {
           attributes: true,
           attributeOldValue : true
        });
      }

      return result.promise;
    };

    /**
     * @return {Promise} A promise that resolves when the parent tree of the
     * image node changes.
     * @private
     */
    MirageImage.prototype.parentTreeChanges_ = function() {
      if (this.parentTreeChangesPromise_) {
        return this.parentTreeChangesPromise_;
      }

      var result = q.defer();

      this.parentTreeCheckInterval_ =  window.setInterval(bind(function() {
        var treeIsTheSame = MirageImage.matchesParentTree(this.image_,
                                                          this.parentTree_);

        if (!treeIsTheSame) {
          this.parentTree_ = MirageImage.resolveParentTree(this.image_);

          window.clearInterval(this.parentTreeCheckInterval_);
          this.parentTreeCheckInterval_ = null;
          this.parentTreeChangesPromise_ = null;

          result.resolve();
        }
      }, this), MirageImage.PARENT_TREE_POLL_INTERVAL);

      this.parentTreeChangesPromise_ = result.promise;
      return result.promise;
    };


    /**
     * Removes display: none from the set of styles that hide the image prior
     * to restoration.
     * @private
     */
    MirageImage.prototype.makeMeasurable_ = function() {
      if (this.restored_) {
        return;
      }
      
      if (classes.has(this.image_, MirageImage.INVISIBLE_CLASS)) {
        classes.remove(this.image_, MirageImage.INVISIBLE_CLASS);
      }
      else {
        dom.setAttribute(this.image_, 'style', 'visibility:hidden');
      }
    };

    /**
     * @private
     */
    MirageImage.prototype.wrap_ = function() {
      if (!this.requireProxy_) {
        this.wrapImage_();
      }
      else {
        if (!this.proxy_) {
          this.proxy_ = this.makeProxy();
        }
        this.image_ = this.proxy_;
      }
    };

    /**
     * @private
     */
    MirageImage.prototype.wrapImage_ = function() {
      try {
        var image = this;
        var getAttribute = this.image_.getAttribute;
        var setAttribute = this.image_.setAttribute;

        var unwrapSrc = defineProperty(this.image_, 'src', {
          get: function() {
            return image.getSrc();
          },
          set: function(value) {
            if (!image.restoring_) {
              dom.setData(image.image_, 'cfsrc', value);
            }
          }
        });
        var unwrapGetAttribute = defineProperty(this.image_, 'getAttribute', {
          value: function(name) {
            if (name === "src") {
              return image.getSrc();
            }
            if (name === 'style') {
              return image.getStyle();
            }

            return getAttribute.apply(image.image_, arguments);
          }
        });
        var unwrapSetAttribute = defineProperty(this.image_, 'setAttribute', {
          value: function(name, value) {
            if (name === 'src') {
              dom.setData(image.image_, 'cfsrc', value);
            } else if (name === 'style') {
              dom.setData(image.image_, 'cfstyle', value);
            } else {
              setAttribute.apply(image.image_, arguments);
            }
          }
        });

        this.wrappedPropertyCache_.push(unwrapSrc,
                                        unwrapGetAttribute,
                                        unwrapSetAttribute);
      } catch(e) {
        //cannot define property on image nodes ..
        if (!this.proxy_) {
          this.proxy_ = this.makeProxy();
        }
        this.image_ = this.proxy_;
      }
    };
    // Instrumentation
    MirageImage.timeMethod('wrap_', ['image', 'dom']);


    /**
     * @private
     */
    MirageImage.prototype.makeProxy = function() {

      var proxy = {};
      proxy.origImage_ = this.image_;
      var image_ = this.origImage_;
      var image = this;

      iter.forEach(this.image_,
        function(value, property) {
          if (typeof value == 'function') {
            proxy[property] = function() {return this.origImage_[property].apply(this.origImage_, arguments);};
          }
          else {
            if (property.toUpperCase() === 'SRC') {
             util.defineProperty(proxy, property,
                {
                  get : function() {return image.getSrc();},
                  set : function(value) {dom.setData(this.origImage_, 'cfsrc', value);}
                }
              );
            }
            else {
              util.defineProperty(proxy, property,
              {
                get : function() {return this.origImage_[property];},
                set : function(value) {this.origImage_[property] = value;}
              });
            }
          }
      } ,null, true);

      defineProperty(proxy, 'getAttribute', {
        value : function(attributeName) {
          if (attributeName.toUpperCase() === 'SRC') {
            return image.getSrc();
          }
          else if (attributeName.toUpperCase() === 'STYLE') {
            return image.getStyle();
          }
          else {
            return this.origImage_.getAttribute(attributeName);
          }
        }
      });

      defineProperty(proxy, 'setAttribute', {
          value: function(name, value) {
            if (name === 'src') {
              dom.setData(this.origImage_, 'cfsrc', value);
            } else if (name === 'style') {
              dom.setData(this.origImage_, 'cfstyle', value);
            } else {
              setAttribute.apply(this.origImage_, arguments);
            }
          }
      });

      return proxy;
    };

    /**
     * @private
     */
    MirageImage.prototype.unwrap_ = function() {
      if (this.wrappedPropertyCache_.length) {
        iter.forEach(this.wrappedPropertyCache_, function(unwrapProperty) {
          unwrapProperty();
        });
      } else {
        // Undo Proxy..
        this.image_ = this.proxy_.origImage_;
      }
    };


    // Thread support..
    var MirageLoader = thread.createProxy(
        'MirageLoader', function(log, error) {


      /**
       * @param {Object=} options An optional hash of configuration options.
       * @constructor
       */
      var MirageLoader = function MirageLoader(options) {
        this.supportsBinaryData_ = options ? !!options.supportsBinaryData : false;
        this.map_ = {};
        this.timer_ = null;

        // TODO: Remove this when we have figured out the proper threshold
        // where dataURLs should be used automatically is decided.
        this.supportsBinaryData_ = false;

        if (this.supportsBinaryData_ && typeof Thread === 'undefined') {
          // We are in a worker, so let's test for binary data compatibility..
          if (typeof ArrayBuffer === 'undefined') {
            this.supportsBinaryData_ = false;
          }

          if (typeof URL === 'undefined' && typeof webkitURL === 'undefined' &&
              typeof mozURL === 'undefined') {
            this.supportsBinaryData_ = false;
          }

          if (typeof Blob === 'undefined' &&
              typeof BlobBuilder === 'undefined' &&
              typeof WebKitBlobBuilder === 'undefined' &&
              typeof MozBlobBuilder === 'undefined') {
            this.supportsBinaryData_ = false;
          }
        }

        this.loadStrategy_ = this.supportsBinaryData_ ?
            this.loadArrayBuffer_ : this.loadDataUrls_;
      };


      /**
       * @type {Number} The interval during which multiple calls to load will
       * batched into one request.
       * @static
       */
      MirageLoader.LOAD_TICK_INTERVAL = 200;


      /**
       * @type {String} The location fragment representing the path to the
       * binary bag.
       * @static
       */
      MirageLoader.BINARY_LOCATION_FRAGMENT =
          '/cdn-cgi/pe/mirage_bag?format=binary';


      /**
       * @type {String} The location fragment representing the path to the
       * data-url bag.
       * @static
       */
      MirageLoader.DATAURL_LOCATION_FRAGMENT =
          '/cdn-cgi/pe/mirage_bag?format=base64';


      /**
       * @type {String} The header name of the secure token from a bag request
       * for use with the profiler end-point.
       * @static
       */
      MirageLoader.PROFILER_TOKEN_HEADER = 'DS-Token';



      /**
       * @param {String} url The URL of an image to load.
       * @return {Promise<String>} A promise that resolves with the string src
       * for a degraded version of the image being loaded.
       */
      MirageLoader.prototype.load = function(url) {
        var result = this.map_[url] = this.map_[url] || q.defer();

        if (this.timer_ === null) {
          this.timer_ = setTimeout(bind(function() {
            var map = this.map_;
            var queue = Object.keys(map);

            this.map_ = {};
            this.timer_ = null;

            this.loadStrategy_(
                queue, bind(function(originalSrc, degradedSrc, width, height) {
                    map[originalSrc].resolve({
                      src: originalSrc,
                      width: width,
                      height: height,
                      degradedSrc: degradedSrc
                    });
            }, this), bind(function(originalSrc, loadStatus){
              map[originalSrc].reject({
                loadStatus: loadStatus,
                message : originalSrc  + " was not preloaded"
              });
            })).then(function(preloadedMap) {
              for (var url in map) {
                if (!(url in preloadedMap)) {
                  map[url].reject(new Error(url + ' was not preloaded.'));
                }
              }
            }, function(e) {
              // On error, reject all of the batched load requests..
              for (var url in map) {
                map[url].reject(new Error('Fatal XHR failure.' +
                                          (e ? ' ' +  e.message : '')));
              }
            });
          }, this), MirageLoader.LOAD_TICK_INTERVAL);
        }

        return result.promise;
      };

      /**
       * This method retrieves the token from teh bag request to use 
       * when posting to the profiler. As this can be run inside a webworker 
       * the result is either posted as message or set directly.
      **/
      MirageLoader.setProfilerToken_ = function(token) {
        if (typeof window === 'object') {
          profiler.setToken(token);
        }
        else {
          postMessage({ arguments : [token],
                        operation : 'set-profiler-token'});
        }
      };

      /**
       * This method handles AJAX for dataURLs. It makes a request and fields
       * the response as a string. Distinct degraded images are streamed back
       * to the caller via an onProgress handler.
       * @param {Array<String>} urls An array of URLs to load.
       * @param {Function} onProgress A progress handler.
       * @return {Promise} A promise that resolves with the response of the
       * request.
       */
      MirageLoader.prototype.loadDataUrls_ = function(urls, onProgress, onError) {
        var xhr = new XMLHttpRequest();
        var uriTooLong = false;

        function createDataUrl(str, url, index) {
          var urlItem = '&r[]=' + encodeURIComponent(url);
          // Maximum URL length for IE8 and below is 2083 characters : http://support.microsoft.com/kb/208427
          if (typeof dom !== 'undefined') {
            if (dom.internetExplorer <= 8) {
              uriTooLong = (str.length + urlItem.length > 2032);
            }
          }
          return str + ((index < mirageConfig.maxdegradedimages && !uriTooLong) ? urlItem : '');
        }

        var url = origin;

        if ('function' === typeof Array.prototype.reduce) {
          url += urls.reduce(createDataUrl, MirageLoader.DATAURL_LOCATION_FRAGMENT);
        }
        else {
          url += arrayReduce(urls, createDataUrl, MirageLoader.DATAURL_LOCATION_FRAGMENT);
        }

        var map = {};
        var result = q.defer();
        var stringIndex = 0;

        xhr.open('get', url);

        if (mirageConfig.petoken) {
          xhr.setRequestHeader('PE-Token', mirageConfig.petoken);
        }

        xhr.onreadystatechange = function() {

          try {
            if (xhr.status > 299) {
              return result.reject();
            }
          } catch(e) {}

          if (xhr.readyState > 2 && typeof xhr.responseText !== 'unknown') {
            var response = xhr.responseText;

            while (response && stringIndex < response.length) {
              try {
                (function() {
                  var degraded = new MirageDegradedImageFallback(response,
                                                                 stringIndex);
                  stringIndex += degraded.stringLength;
                  map[degraded.src] = degraded;

                  if (degraded.isValid()) {
                   degraded.resolveSrc().then(function(degradedSrc) {
                      onProgress(degraded.src, degradedSrc,
                                 degraded.width, degraded.height);
                    });
                  }
                  else {
                    onError(degraded.src, degraded.json.loadStatus);
                  }
                })();
              } catch(e) {
                break;
              }
            }

            if (xhr.readyState === 4) {
              var token =  xhr.getResponseHeader(MirageLoader.PROFILER_TOKEN_HEADER);
              MirageLoader.setProfilerToken_(token);
              result.resolve(map);
            }
          }
        };

        xhr.send();

        return result.promise;
      };


      /**
       * This method handles AJAX for binary data. It makes a request and fields
       * the response as an ArrayBuffer. Presently, XHR2 binary response
       * containers cannot be streamed. This is a distinct disadvantage when
       * compared to using dataURLs generated by the server.
       * @param {Array<String>} urls An array of URLs to load.
       * @param {Function} onProgress A progress handler.
       * @param {Function} onError An error handler.
       * @return {Promise} A promise that resolves with the response of the
       * @see http://www.w3.org/TR/XMLHttpRequest/#the-response-attribute
       * request.
       */
      MirageLoader.prototype.loadArrayBuffer_ = function(urls, onProgress, onError) {
        var xhr = new XMLHttpRequest();
        var url = origin +
              urls.reduce(function(str, url, index) {
                  return str + ((index < mirageConfig.maxdegradedimages) ?
                                '&r[]=' + encodeURIComponent(url) : '');
              },MirageLoader.BINARY_LOCATION_FRAGMENT);
        var map = {};
        var result = q.defer();
        var byteIndex = 0;

        xhr.open('get', url, true);
        
        if (mirageConfig.petoken) {
          xhr.setRequestHeader('PE-Token', mirageConfig.petoken);
        }

        xhr.responseType = 'arraybuffer';
        xhr.onreadystatechange = function() {
          try {
            if (xhr.status > 299) {
              return result.reject();
            }
          } catch(e) {}

          if (xhr.readyState > 2) {
            var buffer = xhr.response;

            while (buffer && byteIndex < buffer.byteLength) {
              try {
                (function() {
                  var degraded = new MirageDegradedImage(buffer, byteIndex);
                  byteIndex += degraded.byteLength;
                  map[degraded.src] = degraded;

                  if (degraded.isValid()) {
                    degraded.resolveSrc().then(function(degradedSrc) {
                      onProgress(degraded.src, degradedSrc,
                               degraded.width, degraded.height);
                   });
                  }
                  else {
                    onError(degraded.src, degraded.json.loadStatus);
                  }
                })();
              } catch(e) {
                break;
              }
            }

            if (xhr.readyState === 4) {
              result.resolve(map);
            }
          }
        };
        xhr.send();

        return result.promise;
      };


      return MirageLoader;
    },
      { event : "set-profiler-token", cb : function(value) {profiler.setToken(value);}}
    );
    // Instrumentation..
    MirageLoader = profiler.spyOnClass(MirageLoader, 'MirageLoader');
    MirageLoader.timeConstructor(['ajax']);
    MirageLoader.timePromisedMethod('load', ['ajax', 'image', 'url']);
    MirageLoader.timePromisedMethod('loadDataUrls_', ['ajax', 'image', 'url']);
    MirageLoader.timePromisedMethod('loadArrayBuffer_', ['ajax', 'image', 'buffer']);

    /**
     * The MirageManager coordinates the over-arching loading strategy.
     * @constructor
     */
    var MirageManager = function MirageManager() {
      this.manifest_ = new CacheManifest();
      this.connection_ = new NetworkConnection();
      this.imageCache_ = [];
      this.forcePreload_ = /forcepreload/.test(window.location.search);
      this.forcePreloadOnly_ = /forcepreloadonly/.test(window.location.search);
      this.forceEagerLoad_ = /forceeagerload/.test(window.location.search);
      this.forceDataUrls_ = /forcedataurls/.test(window.location.search);
      this.optimizationTimeout_ = null;
      this.requireProxy_ = false;
      this.loadStatistics = {};
      this.nativeMethods = {};

      if (this.forcePreload_) {
        this.manifest_.clear();
      }

      if (this.forceEagerLoad_) {
        mirageConfig.eagerLoad = true;
      }

      this.supportsBinaryData_ = true;

      // Check for Typed Array support..
      if (typeof window.ArrayBuffer === 'undefined') {
        this.supportsBinaryData_ = false;
      }

      // Check for DOM Blobs..
      if (typeof window.Blob === 'undefined' &&
          typeof window.BlobBuilder === 'undefined' &&
          typeof window.WebKitBlobBuilder === 'undefined' &&
          typeof window.MozBlobBuilder === 'undefined') {
        this.supportsBinaryData_ = false;
      }

      // Check for Canvas 2D..
      var canvas = document.createElement('canvas');
      if (typeof canvas.getContext === 'undefined') {
        this.supportsBinaryData_ = false;
      } else {
        try {
          var context = canvas.getContext('2d');
        } catch(e) {
          this.supportsBinaryData_ = false;
        }
      }

      if (this.forceDataUrls_) {
        this.supportsBinaryData_ = false;
      }

      this.loader_ = new MirageLoader({
        supportsBinaryData: this.supportsBinaryData_
      });
    };
    // Instrumentation..
    MirageManager = profiler.spyOnClass(MirageManager);
    MirageManager.timeConstructor(['flow']);


    /**
     * @type {Number} A timeout after which all captured images are
     * automatically restored.
     * @static
     */
    MirageManager.OPTIMIZATION_TIMEOUT = 30000;

    /**
     * @type {Number} The maximum distance from the viewport to trigger 
     * lazy loading of an image
     * @static
     */
    MirageManager.DISTANCE_FROM_VIEWPORT = 100;


    /**
     * @type {Number} A timeout to load images which were not in the list of
     * images to be degraded.
     * @static
     */
    MirageManager.RESTORE_NON_DEGRADED_IMAGE_TIMEOUT = 50;


    /**
    * This method removes the NOSCRIPT tags inserted into the page by the Mirage parser.
    * As some slidershows were using all children within a container.
    **/
    MirageManager.prototype.sanitiseDOM = function() {
      var imageNodes = util.toArray(document.getElementsByTagName('img'));
      return iter.map(imageNodes, function(imageNode) {
        var cfsrc = dom.getData(imageNode, 'cfsrc');
        if (cfsrc) {
          if (imageNode.nextSibling && imageNode.nextSibling.tagName == 'NOSCRIPT') {
            imageNode.parentElement.removeChild(imageNode.nextSibling);
          }
        }
      });
    };

    /**
    * Set document methods that return elements back to the originals.
    **/
    MirageManager.prototype.releaseNativeMethods = function() {
      iter.forEach(this.nativeMethods, function(nativeMethod, methodName) {
          document[methodName] = nativeMethod;
      });
    };

    MirageManager.prototype.proxyElementList = function(methodName) {
      var nativeMethod = this.nativeMethods[methodName];
      return bind(function(selector) {
        var elements = nativeMethod.call(document, selector);
        return iter.map(elements, function(element) {
          return this.proxyMirageImage(element);
        }, this);
      }, this);
    };

    MirageManager.prototype.proxyElement = function(methodName) {
      var nativeMethod = this.nativeMethods[methodName];
      return bind(function(selector) {
        return this.proxyMirageImage(nativeMethod.call(document, selector));
      }, this);
    };

    /**
    * @param {Element} The element that may need to be proxied
    * @return {Element} The original element or the proxy if the element is an image 
    * and was captured as a MirageImage. 
    **/
    MirageManager.prototype.proxyMirageImage = function(element) {
  
      if (element && element.nodeName && element.nodeName.toUpperCase() === "IMG") {
        var cachedMirageImage = iter.find(this.imageCache_, function(mirageImage) {
          return (mirageImage.image_.origImage_ === element);
        });
        return cachedMirageImage ? cachedMirageImage.image_ : element;
      }
      return element;
    };

    /**
    * If a proxy object is required for Mirage Images then alter the document methods to return the 
    * proxy objects when applicable in HTMLCollections/NodeLists or Elements.
    *  
    **/
    MirageManager.prototype.captureNativeMethods = function() {

      var cache = this.imageCache_;
      var captureNativeMethodList = ['getElementsByTagName', 'getElementById', 'getElementsByClassName', 'querySelectorAll', 'querySelector'];

      iter.forEach(captureNativeMethodList, function(methodName) {
        this.nativeMethods[methodName] = document[methodName];
      }, this);

      document['getElementsByClassName'] = this.proxyElementList('getElementsByClassName');
      document['querySelectorAll'] = this.proxyElementList('querySelectorAll');
      document['getElementById'] = this.proxyElement('getElementById');
      document['querySelector'] = this.proxyElement('querySelector');

      document['getElementsByTagName'] = bind(function(type) {
          var nativeMethod = this.nativeMethods['getElementsByTagName'];
          if (type.toUpperCase() === "IMG") {
            var imgs = nativeMethod.call(document, 'img');
            return iter.map(imgs, function(img) {
              return this.proxyMirageImage(img);
            }, this);
          }
          return nativeMethod.apply(document, arguments);
        }, this);
    };

    /**
     * @return {Array} The list of images captured by the call to capture.
     */
    MirageManager.prototype.capture = function() {
      var imageNodes = util.toArray(document.getElementsByTagName('img'));
      return iter.map(imageNodes, function(imageNode) {
        var image;
        if (MirageImage.isValidCandidate(imageNode)) {
          image = new MirageImage(imageNode, {forcePreloadOnly_ : this.forcePreloadOnly_, proxy_ : this.requireProxy_});
          image.whenRestored(bind(function() {
            this.manifest_.record(image.getSrc());
          }, this));
          this.imageCache_.push(image);
        }
        return image;
      }, this);
    };
    // Instrumentation..
    MirageManager.timeMethod('capture', ['flow', 'image', 'dom']);

    /**
     * Log the status of the load of the degraded images
     * @param {String} The status of the load of a degraded image.
     */
    MirageManager.prototype.logPreload = function(status) {
      if (status in this.loadStatistics) {
        this.loadStatistics[status]++;
      }
      else {
        this.loadStatistics[status] = 1;
      }
    };

    /**
     * @return {Promise} A promise that resolves when all captured images have
     * have been preloaded.
     */
    MirageManager.prototype.preload = function() {
      // Filter out hot-in-cache imags
      return this.reducePreloadableImages_().then(
          bind(function(preloadableImages) {

        if (preloadableImages.length) {
          // Load the degraded versions of these images via the appropriate mechanism..
          var operations = iter.map(preloadableImages, function(image) {
            var operation = this.loader_.load(image.getSrc()).then(
                bind(function(imageData) {

              var postProcess;
              // TODO: Handle no-degradedSrc case..
              this.logPreload(MirageImageJSON.state.LOAD_OK);

              if (this.supportsBinaryData_) {
                // When CanvasProxy comes out, we can move 'post processing'
                // into the Worker..
                postProcess = this.postProcess_(
                    imageData.degradedSrc, imageData.width, imageData.height);
              } else {
                postProcess = q.ref(imageData.degradedSrc);
              }

              return postProcess.then(function(degradedSrc) {
                return image.setDegradedSrc(degradedSrc).then(function() {
                  // When the onload event has fired, restore the image..
                  return dom.onLoad.then(function() {
                    return image.restoreWithinViewport();
                  });
                });
              });
            }, this), bind(function(e) {
              error('Attempt to preload image failed.', e.message);
              this.logPreload(e.loadStatus);
              // Fallback to restoring the image..
              return dom.onLoad.then(function() {
                return image.restore();
              });
            }, this));

            // We only want to defer until images within the viewport (in
            // other words: images that are not lazy-loaded) are restored..
            if (image.isWithinViewport()) {
              return operation;
            }

            return q.ref();
          }, this);

          // Fallback timer to catch worst-case scenarios..
          this.optimizationTimeout_ = window.setTimeout(function() {
            iter.forEach(preloadableImages, function(image) {
              image.restore();
            });
          }, MirageManager.OPTIMIZATION_TIMEOUT);

          return q.all(operations).then(bind(function() {
            profiler.recordMeta("imageLoadStatistics" , this.loadStatistics);
            if (this.optimizationTimeout_) {
              window.clearTimeout(this.optimizationTimeout_);
            }
          }, this));
        }
      }, this));
    };


    /**
     * Backfills all images that have been captured with their full quality
     * versions.
     */
    MirageManager.prototype.backfill = function() {
      var operations = [];
      iter.forEach(this.imageCache_, function(image) {
        var operation = image.restore();

        // We only want to defer until images within the viewport (in
        // other words: images that are not lazy-loaded) are restored..
        if (image.isWithinViewport()) {
          operations.push(operation);
        }
      }, this);

      return q.all(operations);
    };
    // Instrumentation..
    MirageManager.timeMethod('backfill', ['flow', 'dom', 'image']);


    /**
     * Resets the image cache. This method exists mostly for the benefit of
     * testability.
     */
    MirageManager.prototype.reset = function() {
      this.imageCache_ = [];
      this.manifest_.clear();
    };


    /**
     * Sets the mirage config. This method exists for the benefit of
     * testability.
     */

    MirageManager.prototype.setConfig = function(conf) {
      mirageConfig.maxjsonsize = conf.maxjsonsize || 100000;
      mirageConfig.profile = conf.profile || false;
      mirageConfig.maxdegradedimages = conf.maxdegradedimages || 50;
      mirageConfig.maxexternalimages = conf.maxexternalimages || 50;
      mirageConfig.eagerLoad = mirageConfig.eagerLoad || false;
      mirageConfig.petoken = conf.petok;
    };



    MirageManager.prototype.accessorTest = function() {
      var imageNodes = util.toArray(document.getElementsByTagName('img'));
        if (imageNodes.length && imageNodes.length >=1) {
          var oldDescriptor = Object.getOwnPropertyDescriptor(imageNodes[0], 'src');
          if (oldDescriptor && !oldDescriptor.configurable) {
            return true;
          }
          // Can't access original getter/setter see https://code.google.com/p/chromium/issues/detail?id=43394
          //if (typeof imageNodes[0].__lookupGetter__('src') === 'undefined') {
          //  return true;
         // }
        }
      return false;
    }

    /**
     * Encapsulates the Mirage loading flow. Images are gathered and processed,
     * and eventually async-loaded.
     */
    MirageManager.prototype.activate = function() {
      // Wait for DOMContentLoaded..
      return dom.onReady.then(bind(function() {

        this.sanitiseDOM();

        // Test if src property is configurabe if not a proxy is required
        this.requireProxy_ = this.accessorTest();

        // Capture any image tags..
        this.capture();

        if (this.requireProxy_) {
            this.captureNativeMethods();
        }

        // Assess the connection latency..
        return this.connection_.assessLatency().then(bind(function(isHighLatency) {
          if (isHighLatency || this.forcePreload_) {
            // Preload images for high-latency mobile clients..
            return this.preload();
          } else {
            // For everyone else, backfill high-quality images immediately..
            return this.backfill();
          }
        }, this));
      }, this));
    };
    // Instrumentation..
    MirageManager.timePromisedMethod('activate', ['flow', 'regex', 'useragent']);


    /**
     * Handles post-processing of ArrayBuffer-derived degraded images. When
     * CanvasProxy lands in browsers, this should be moved to a Worker.
     * @param {String} src The candidate src value for an image.
     * @param {Number} width The pixel width of the image.
     * @param {Number} height The pixel height of the image.
     * @return {Promise<String>} A promise that resolves with the post-processed
     * src value of the image.
     * @see http://www.w3.org/html/wg/drafts/html/master/embedded-content-0.html#canvasproxy
     * @private
     */
    MirageManager.prototype.postProcess_ = function(src, width, height) {
      var canvas = document.createElement('canvas');
      var image = document.createElement('img');
      var context = canvas.getContext('2d');
      var result = q.defer();

      canvas.width = width;
      canvas.height = height;

      image.addEventListener('load', bind(function() {
        context.drawImage(image, 0, 0, width, height);
        result.resolve(canvas.toDataURL());
      }, this));
      image.addEventListener('error', bind(function(e) {
        error('Error loading image.');
        result.resolve('');
      }, this));

      image.src = src;

      return result.promise;
    };

    /**
     * @return {Promise} A promise that resolves to a list of preloadable images
     * bounding the maximum total number and the number of external images.
     * @param {Array} Array of preloadable images
     * @private
     */

    MirageManager.prototype.limitPreloadableImages_ = function(preloadableImages) {

      var externalImageList = [];
      var preloadList = [];

      var filteredImages = iter.filter(preloadableImages, function(result) {
          return !!result;
        });

      iter.forEach(filteredImages, function(src, i) {
        var isSameOrigin = path.sameOrigin(src);
        if (i < mirageConfig.maxdegradedimages) {
          if (!isSameOrigin)
            externalImageList.push(i);
          preloadList.push(src);
        }
        else {
          if (isSameOrigin &&
              externalImageList.length > mirageConfig.maxexternalimages) {
            preloadList.splice(externalImageList.pop(), 1);
            preloadList.push(src);
           }
        }
      });
      return q.ref(preloadList);
    };

    // Instrumentation..
    MirageManager.timePromisedMethod('limitPreloadableImages_',
                                     ['cache', 'image', 'dom']);


    /**
     * @return {Promise<Array>} A promise that resolves with an array or URLs
     * that the manager should attempt to load degraded versions for.
     * @private
     */
    MirageManager.prototype.reducePreloadableImages_ = function() {
      var urls = this.getUniqueSrcs_();
      var validations = [];
      var srcsToPreload = [];
      var externalImageList = [];

      iter.forEach(urls, function(src, i) {
        validations.push(q.ref().then(bind(function() {
          return this.manifest_.has(src).then(function(isHotInCache) {
             if (!isHotInCache) {
               return src;
            }
          });
        }, this), function() {
          // CFJS promises doesn't implement catch..
        }));
      }, this);

       return q.all(validations).then(bind(function(results) {

          return this.limitPreloadableImages_(results).then(
              bind(function(srcsToPreload){

            var srcMap = {};
            var preloadableImages;

            iter.forEach(srcsToPreload, function(src) {
              srcMap[src] = true;
            }, {});

            var imgsToRestore = [];

            preloadableImages = iter.filter(this.imageCache_, function(image) {
              var preload = srcMap[image.getSrc()];
              if (!preload) {
                this.push(image);
              }
              return preload;
            }, imgsToRestore);
            // Restore the images which are not to be preloaded..
            if (imgsToRestore.length > 0) {
              window.setTimeout(function() {
                iter.forEach(imgsToRestore, function(image) {
                image.restore();
              });
            }, MirageManager.RESTORE_NON_DEGRADED_IMAGE_TIMEOUT );
          }
          return preloadableImages;
        }, this));
      }, this));
    };
    // Instrumentation..
    MirageManager.timePromisedMethod('reducePreloadableImages_',
                                     ['cache', 'image', 'dom']);


    /**
     * @private
     * @return {Array} A list of all unique src attributes among the captured
     * images.
     */
    MirageManager.prototype.getUniqueSrcs_ = function() {
      var urls = {};
      var primary = [];
      var secondary = [];
      var width = window.innerWidth;
      var height = window.innerHeight;
      iter.forEach(this.imageCache_, function(image) {
        var top = image.getTop();
        var left = image.getLeft();
        var src = image.getSrc();
        if (top < height && left < width && !urls[src]) {
          primary.push(src);
        } else {
          secondary.push(src);
        }
        urls[image.getSrc()] = true;
      });
      return primary.concat(secondary);
    };
    // Instrumentation..
    MirageManager.timeMethod('getUniqueSrcs_', ['dom', 'image']);


    if (typeof MIRAGE_TEST_MODE === 'undefined') {

      // Start the Worker thread..
      thread.start().then(function() {

        // Instantiate a new manager instance..
        var mirage = new MirageManager();

        mirage.activate().then(function() {
          profiler.mark('end');
          if (mirage.requireProxy_) {
            mirage.releaseNativeMethods();
          }

          profiler.submit().then(function(id) {
            log('Session JSON recorded for' + id);
          }, function(e) {
            error('Profiler submission failed.', e.message);
          });

          // Stop the worker thread..
          thread.stop();
        });

      });
      dom.onReady.then(function() {
        profiler.mark('ready');
      });
      dom.onLoad.then(function() {
        profiler.mark('load');
      });
      dom.onMutation(function(record) {
        profiler.mark('mutation:' + record.type + ':' + record.target.nodeName);
      });
    }

    // Export our classes for later testing..
    return {
      'MirageLoader': MirageLoader,
      'MirageManager': MirageManager,
      'PNGChunk': PNGChunk,
      'PNGImage': PNGImage,
      'MirageDegradedImage': MirageDegradedImage,
      'MirageDegradedImageFallback': MirageDegradedImageFallback,
      'MirageImage': MirageImage,
      'MirageImageJSON': MirageImageJSON,
      'CacheManifest': CacheManifest,
      'NetworkConnection': NetworkConnection,
      'Thread': Thread,
      'thread': thread,
      'profiler':profiler,
      'arrayBufferSlice':arrayBufferSlice
    };
  });
/*
//@ sourceURL=mirage.js
*/
