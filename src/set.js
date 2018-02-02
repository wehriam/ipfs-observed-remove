// @flow

import type { ObservedRemoveSet as ObservedRemoveSetType } from 'observed-remove/src';

const getIpfsClass = require('./mixin');
const ObservedRemoveSet:Class<ObservedRemoveSetType<*>> = require('observed-remove').ObservedRemoveSet;

module.exports = getIpfsClass(ObservedRemoveSet);

