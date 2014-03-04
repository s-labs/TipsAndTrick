CloudFlare.define(
  ['cloudflare/iterator', 'cloudflare/deferred', 'cloudflare/console'],
  function(iter, q, console) {



    /**
     * @constructor
     */
    function Clock(name, tags) {
      this.name = name;
      this.tags = tags || [];
      this.createdTime_ = Clock.now();

    }


    /**
     * Date.now polyfill
     * @static
     */
    Clock.now = function() {
      return Date.now ? Date.now() : +new Date();
    };


    /**
     * @private
     */
    Clock.prototype.getLatestTime_ = function() {
      return this.stoppedTime_ ?  this.stoppedTime_ : Clock.now();
    };


    /** @inheritDoc **/
    Clock.prototype.toJSON = function() {
      return {
        name: this.name,
        tags: this.tags,
        start: this.startedTime_,
        end: this.getLatestTime_(),
        delta: this.getDelta(),
        stopped: !this.isTicking()
      };
    };


    /** @inhertiDoc **/
    Clock.prototype.toString = function() {
      return 'Time (' + this.name + '): ' + this.getDelta();
    };


    /**
     * Reset the clock to t0.
     */
    Clock.prototype.reset = function() {
      this.startedTime_ = this.createdTime_;
      this.stoppedTime_ = this.createdTime_;
      return this;
    };


    /**
     * Start the clock.
     */
    Clock.prototype.start = function() {
      this.startedTime_ = Clock.now();
      this.stoppedTime_ = null;
      return this;
    };


    /**
     * Stop the clock.
     */
    Clock.prototype.stop = function() {
      if (!this.stoppedTime_) {
        this.stoppedTime_ = Clock.now();
      }
      return this;
    };


    /**
     * @return {number} The amount of time the clock has been ticking, in ms.
     */
    Clock.prototype.getDelta = function() {
      return this.getLatestTime_() - this.startedTime_;
    };


    /**
     * @return {Boolean} True if the clock is currently ticking.
     */
    Clock.prototype.isTicking = function() {
      return !this.stoppedTime_;
    };



    /**
     * @constructor
     */
    function Mark(name) {
      this.name = name;
      this.time = Clock.now();
    }


    /** @inheritDoc **/
    Mark.prototype.toJSON = function() {
      return {
        name: this.name,
        time: this.time
      };
    };


    /** @inheritDoc **/
    Mark.prototype.toString = function() {
      return 'Mark (' + this.name + '): ' + this.time;
    };



    /**
     * Note: the Function.name property is non-standard. Maybe borrow Sinon's
     * polyfill?
     * @see https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/name
     * @see https://github.com/cjohansen/Sinon.JS/blob/master/lib/sinon.js#L185
     * @constructor
     */
    function ClassSpy(SpiedConstructor, name, profiler) {
      var Constructor = SpiedConstructor.__ORIGINAL__;
      this.profiler_ = profiler;
      this.name_ = name || Constructor.displayName || Constructor.name || 'SpiedClass';
      this.Constructor_ = SpiedConstructor;
      this.constructorTags_ = null;
    }


    ClassSpy.prototype.getName = function() {
      return this.name_;
    };


    /**
     * @return {Boolean} True if the spied class's constructor is being timed.
     */
    ClassSpy.prototype.isTimingConstructor = function() {
      return !!this.constructorTags_;
    };


    /**
     * @return {Array} The tags associated with the constructor's timing.
     */
    ClassSpy.prototype.getConstructorTags = function() {
      return this.constructorTags_;
    };


    /**
     * Profile the spied class's constructor.
     * @param {Array} tags An array of tags to associate with the constructor.
     */
    ClassSpy.prototype.timeConstructor = function(tags) {
      tags.push('constructor');
      this.constructorTags_ = tags;
    };


    /**
     * Profile the named method of the spied class.
     * @param {String} method A method name.
     * @param {Array} tags The tags to associate with the method.
     */
    ClassSpy.prototype.timeMethod = function(method, tags) {
      var original = this.Constructor_.prototype[method];
      var profiler = this.profiler_;
      var name = this.name_ + '#' + method;
      tags.push('method');

      this.Constructor_.prototype[method] = function() {
        var clock = profiler.startClock(name, tags);
        var result = original.apply(this, arguments);
        clock.stop();
        return result;
      };
    };


    /**
     * Profile the named static method of the spied class.
     * @param {String} method A method name.
     * @param {Array} tags The tags to associate with the method.
     */
    ClassSpy.prototype.timeStaticMethod = function(method, tags) {
      var original = this.Constructor_[method];
      var profiler = this.profiler_;
      var name = this.name_ + '.' + method;
      tags.push('method', 'static');

      this.Constructor_.prototype[method] = function() {
        var clock = profiler.startClock(name, tags);
        var result = original.apply(this, arguments);
        clock.stop();
        return result;
      };
    };


    /**
     * Profile the named promised method of the spied class.
     * @param {String} method A method name.
     * @param {Array} tags The tags to associate with the method.
     */
    ClassSpy.prototype.timePromisedMethod = function(method, tags) {
      var original = this.Constructor_.prototype[method];
      var profiler = this.profiler_;
      var name = this.name_ + '#' + method;
      tags.push('method', 'promise');

      this.Constructor_.prototype[method] = function() {
        var clock = profiler.startClock(name, tags);
        var result = original.apply(this, arguments);

        return result.then(function(value) {
          clock.stop();
          return value;
        });
      };
    };



    /**
     * @constructor
     */
    function Profiler(options) {
      this.clocks_ = [];
      this.marks_ = [];
      this.meta_ = {};
      this.clockMap_ = {};
      this.enabled_ = !!options.enabled;
      this.submitHandlers_ = [];
      this.token_ = null;

      this.recordMeta('userAgent', window.navigator.userAgent);
      this.recordMeta('created', +new Date());

    }



    /**
    * @type {String} The request header for the token.
    * @static
    */
    Profiler.TOKEN_HEADER = 'DS-Token';


    /**
     * @param {Function} Constructor A constructor.
     * @return {Function} A constructor for a spied version of the class.
     */
    Profiler.prototype.spyOnClass = function(Constructor, name) {

      var SpiedClass =
          function SpiedClass(arg1, arg2, arg3, arg4, arg5, arg6) {
        var time = spy.isTimingConstructor();
        var clock;
        var instance;
        if (time) {
          clock = profiler.startClock(spy.getName(), spy.getConstructorTags());
        }
        instance = new Constructor(arg1, arg2, arg3, arg4, arg5, arg6);
        if (time) {
          clock.stop();
        }
        return instance;
      };

      var profiler = this;
      var spy;

      if (!this.enabled_) SpiedClass = Constructor;
      SpiedClass.__ORIGINAL__ = Constructor;

      spy = new ClassSpy(SpiedClass, name, this);

      if (this.enabled_) {
        for (var property in Constructor.prototype) {
          SpiedClass.prototype[property] = Constructor.prototype[property];
        }
        Constructor.prototype = SpiedClass.prototype;

        for (var property in Constructor) {
          if (Constructor.hasOwnProperty(property)) {
            SpiedClass[property] = Constructor[property];
          }
        }
      }

      iter.forEach(spy.constructor.prototype, function(value, property) {
        SpiedClass[property] = function() {
          return profiler.enabled_ ? value.apply(spy, arguments) : undefined;
        };
      });


      return SpiedClass;
    };


    /**
     * @param {String} name The name of the clock.
     * @param {Array} tags Tags to be associated with the clock.
     * @return {Clock} A clock instance.
     */
    Profiler.prototype.startClock = function(name, tags) {
      var clock = new Clock(name, tags).start();
      this.clocks_.push(clock);
      this.clockMap_[name] = this.clockMap_[name] || [];
      this.clockMap_[name].push(clock);
      return clock;
    };


    /**
     * @param {String} name The name of the mark.
     * @return {Mark} A mark instance.
     */
    Profiler.prototype.mark = function(name) {
      var mark = new Mark(name);
      this.marks_.push(mark);
      return mark;
    };


    /**
     * @param {String} key A name for the meta value being recorded.
     * @param {Stirng} value A value to store against the provided key.
     */
    Profiler.prototype.recordMeta = function(key, value) {
      this.meta_[key] = value;
    };


    Profiler.prototype.setToken = function(token) {
      this.token_ = token;
    };

    /** @inheritDoc **/
    Profiler.prototype.toJSON = function() {
      return {
        clocks: iter.map(this.clocks_, function(clock) {
          return clock.toJSON();
        }),
        marks: iter.map(this.marks_, function(mark) {
          return mark.toJSON();
        }),
        meta: this.meta_
      };
    };


    /**
     * Dumps the profiler to the console.
     */
    Profiler.prototype.report = function() {
      iter.forEach(this.marks_, function(mark) {
        console.log(mark.toString());
      });
      iter.forEach(this.clockMap_, function(clocks, name) {
        var calls = 0;
        var time = 0;

        iter.forEach(clocks, function(clock) {
          if (!clock.isTicking()) {
            ++calls;
            time += clock.getDelta();
          }
        });

        console.log('Timing (' + name + '): ' + calls + ' calls, ' + time + 'ms');
      });
    };


   /**
    * Registers a handler to be called whenever the profiler submits a profile.
    */
    Profiler.prototype.onSubmit = function(handler) {
      this.submitHandlers_.push(handler);
    };

    /**
     * Posts the profiler to a receiving endpoint.
     */
    Profiler.prototype.submit = function() {

      var result = q.defer();

      if (!this.enabled_) {
        return result.promise;
      }

      var xhr = new XMLHttpRequest();
      var url = ('https:' == window.location.protocol ? 'https://' : 'http://') + document.location.host+ '/cdn-cgi/l/ds_miragev2';
      var profiler = this;

      var performance = window.performance || dom.performance;
      profiler.meta_.performance = performance;

      xhr.open('post', url);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      if  (this.token_) {
        xhr.setRequestHeader(Profiler.TOKEN_HEADER, this.token_);
      }
      xhr.onreadystatechange = function() {

        if (xhr.readyState === 4) {
          var responseText = xhr.response;
          var json;
          var id;
          if (responseText) {
            try {
              json = JSON.parse(responseText);
              id = json.id;
              result.resolve(id);
            } catch(e) {
              result.reject(e);
            }

            for(var i = 0; i < profiler.submitHandlers_.length; ++i) {
              profiler.submitHandlers_[i](id);
            }
          }
        }
      };
      xhr.send('data=' + window.encodeURIComponent(JSON.stringify(this)));

      return result.promise;
    };

    // Export the Profiler class as our module.
    return Profiler;
  });
