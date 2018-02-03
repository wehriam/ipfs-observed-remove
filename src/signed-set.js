// @flow

import type { SignedObservedRemoveSet as SignedObservedRemoveSetType } from 'observed-remove/src';
import type { IpfsCrdtType } from './mixin';

const getIpfsClass = require('./mixin');
const SignedObservedRemoveSet:Class<SignedObservedRemoveSetType<*>> = require('observed-remove').SignedObservedRemoveSet;

const IpfsSignedObservedRemoveSet: Class<IpfsCrdtType & SignedObservedRemoveSetType<*>> = getIpfsClass(SignedObservedRemoveSet);

module.exports = IpfsSignedObservedRemoveSet;

