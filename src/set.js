// @flow

import type { ObservedRemoveSet as ObservedRemoveSetType } from 'observed-remove/src';
import type { IpfsCrdtType } from './mixin';

const getIpfsClass = require('./mixin');
const ObservedRemoveSet:Class<ObservedRemoveSetType<*>> = require('observed-remove').ObservedRemoveSet;

const IpfsObservedRemoveSet: Class<IpfsCrdtType & ObservedRemoveSetType<*>> = getIpfsClass(ObservedRemoveSet);

module.exports = IpfsObservedRemoveSet;

