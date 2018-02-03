// @flow

import type { SignedObservedRemoveSet as SignedObservedRemoveSetType } from 'observed-remove/src';

const getIpfsClass = require('./mixin');
const SignedObservedRemoveSet:Class<SignedObservedRemoveSetType<*>> = require('observed-remove').SignedObservedRemoveSet;

module.exports = getIpfsClass(SignedObservedRemoveSet);

