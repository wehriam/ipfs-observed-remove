// @flow

import type { SignedObservedRemoveMap as SignedObservedRemoveMapType } from 'observed-remove/src';

const getIpfsClass = require('./mixin');
const SignedObservedRemoveMap:Class<SignedObservedRemoveMapType<*, *>> = require('observed-remove').SignedObservedRemoveMap;

module.exports = getIpfsClass(SignedObservedRemoveMap);

