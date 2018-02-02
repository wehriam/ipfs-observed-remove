// @flow

import type { ObservedRemoveMap as ObservedRemoveMapType } from 'observed-remove/src';

const getIpfsClass = require('./mixin');
const ObservedRemoveMap:Class<ObservedRemoveMapType<*, *>> = require('observed-remove').ObservedRemoveMap;

module.exports = getIpfsClass(ObservedRemoveMap);

