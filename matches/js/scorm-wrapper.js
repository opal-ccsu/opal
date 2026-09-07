
/**
 * SCORM 1.2 Wrapper
 * PathwayU Unit — CR Path: Career Readiness Through Iteration
 * Provides a clean interface to the SCORM 1.2 LMS API
 */
var SCORM = (function () {
  'use strict';

  var _api = null;
  var _initialized = false;

  function findAPI(win) {
    var attempts = 0;
    while (win.API == null && win.parent != null && win.parent !== win) {
      if (++attempts > 7) return null;
      win = win.parent;
    }
    return win.API || null;
  }

  function getAPI() {
    if (_api) return _api;
    _api = findAPI(window);
    if (!_api && window.opener) {
      try { _api = findAPI(window.opener); } catch (e) {}
    }
    return _api;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  return {

    init: function () {
      var api = getAPI();
      if (api) {
        api.LMSInitialize('');
        _initialized = true;
      }
    },

    terminate: function () {
      var api = getAPI();
      if (api && _initialized) {
        api.LMSFinish('');
        _initialized = false;
      }
    },

    getValue: function (element) {
      var api = getAPI();
      if (!api || !_initialized) return '';
      return api.LMSGetValue(element) || '';
    },

    setValue: function (element, value) {
      var api = getAPI();
      if (!api || !_initialized) return;
      api.LMSSetValue(element, String(value));
    },

    commit: function () {
      var api = getAPI();
      if (!api || !_initialized) return;
      api.LMSCommit('');
    },

    getLearnerID: function () {
      return this.getValue('cmi.core.student_id');
    },

    getLearnerName: function () {
      return this.getValue('cmi.core.student_name');
    },

    setComplete: function () {
      this.setValue('cmi.core.lesson_status', 'completed');
      this.commit();
    },

    setLocation: function (location) {
      this.setValue('cmi.core.lesson_location', String(location));
      this.commit();
    },

    setProgressMeasure: function (measure) {
      // SCORM 1.2 does not have a native progress measure field.
      // Progress is tracked internally via suspend_data.
    },

    getSuspendData: function () {
      var raw = this.getValue('cmi.suspend_data');
      if (!raw || raw === '') return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },

    setSuspendData: function (data) {
      try {
        var str = JSON.stringify(data);
        this.setValue('cmi.suspend_data', str);
        this.commit();
      } catch (e) {}
    },

    setInteraction: function (index, id, type, response) {
      var base = 'cmi.interactions.' + index + '.';
      var d = new Date();
      var time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      try {
        this.setValue(base + 'id', String(id).substring(0, 255));
        this.setValue(base + 'type', type);
        this.setValue(base + 'student_response', String(response).substring(0, 255));
        this.setValue(base + 'time', time);
      } catch (e) {}
    }

  };

})();
