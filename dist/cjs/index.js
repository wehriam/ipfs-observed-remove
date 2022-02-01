"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "InvalidSignatureError", {
  enumerable: true,
  get: function () {
    return _observedRemove.InvalidSignatureError;
  }
});
Object.defineProperty(exports, "IpfsObservedRemoveMap", {
  enumerable: true,
  get: function () {
    return _map.default;
  }
});
Object.defineProperty(exports, "IpfsObservedRemoveSet", {
  enumerable: true,
  get: function () {
    return _set.default;
  }
});
Object.defineProperty(exports, "IpfsSignedObservedRemoveMap", {
  enumerable: true,
  get: function () {
    return _signedMap.default;
  }
});
Object.defineProperty(exports, "IpfsSignedObservedRemoveSet", {
  enumerable: true,
  get: function () {
    return _signedSet.default;
  }
});
Object.defineProperty(exports, "generateId", {
  enumerable: true,
  get: function () {
    return _observedRemove.generateId;
  }
});
Object.defineProperty(exports, "getSigner", {
  enumerable: true,
  get: function () {
    return _observedRemove.getSigner;
  }
});

var _observedRemove = require("observed-remove");

var _set = _interopRequireDefault(require("./set"));

var _map = _interopRequireDefault(require("./map"));

var _signedMap = _interopRequireDefault(require("./signed-map"));

var _signedSet = _interopRequireDefault(require("./signed-set"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
//# sourceMappingURL=index.js.map