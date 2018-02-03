// @flow

import type { SignedObservedRemoveMap as SignedObservedRemoveMapType } from 'observed-remove/src';
import type { IpfsCrdtType } from './mixin';

const getIpfsClass = require('./mixin');
const SignedObservedRemoveMap:Class<SignedObservedRemoveMapType<*, *>> = require('observed-remove').SignedObservedRemoveMap;

const IpfsSignedObservedRemoveMap: Class<IpfsCrdtType & SignedObservedRemoveMapType<*, *>> = getIpfsClass(SignedObservedRemoveMap);

module.exports = IpfsSignedObservedRemoveMap;

