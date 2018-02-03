// @flow

import type { ObservedRemoveMap as ObservedRemoveMapType } from 'observed-remove/src';
import type { IpfsCrdtType } from './mixin';

const getIpfsClass = require('./mixin');
const ObservedRemoveMap:Class<ObservedRemoveMapType<*, *>> = require('observed-remove').ObservedRemoveMap;

const IpfsObservedRemoveMap: Class<IpfsCrdtType & ObservedRemoveMapType<*, *>> = getIpfsClass(ObservedRemoveMap);

module.exports = IpfsObservedRemoveMap;

