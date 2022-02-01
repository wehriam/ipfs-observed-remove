// @flow

import { IpfsObservedRemoveMap, IpfsObservedRemoveSet, IpfsSignedObservedRemoveMap, IpfsSignedObservedRemoveSet } from '../../src';

export default async (maps: Array<IpfsObservedRemoveMap<string, any> | IpfsObservedRemoveSet<any> | IpfsSignedObservedRemoveMap<string, any> | IpfsSignedObservedRemoveSet<any>>) => new Promise((resolve, reject) => {
  const areEqual = async () => {
    for (const map of maps) {
      if (map.isLoadingHashes) {
        return false;
      }
    }
    try {
      const hash = await maps[0].getIpfsHash();
      for (let i = 1; i < maps.length; i += 1) {
        if (await maps[i].getIpfsHash() !== hash) {
          return false;
        }
      }
      for (const map of maps) {
        if (map.isLoadingHashes) {
          return false;
        }
      }
    } catch (error) {
      if (error.type === 'aborted') {
        return false;
      }
      throw error;
    }
    return true;
  };
  const handleTimeout = async () => {
    if (!(await areEqual())) {
      timeout = setTimeout(handleTimeout, 100);
      return;
    }
    for (const map of maps) {
      map.removeListener('error', handleError);
      map.removeListener('hashesloaded', handleHash);
      map.removeListener('hash', handleHash);
    }
    resolve();
  };
  let timeout = setTimeout(handleTimeout, 100);
  const handleError = (error) => {
    clearTimeout(timeout);
    for (const map of maps) {
      map.removeListener('error', handleError);
      map.removeListener('hashesloaded', handleHash);
      map.removeListener('hash', handleHash);
    }
    reject(error);
  };
  const handleHash = async () => {
    clearTimeout(timeout);
    if (await areEqual()) {
      for (const map of maps) {
        map.removeListener('error', handleError);
        map.removeListener('hashesloaded', handleHash);
        map.removeListener('hash', handleHash);
      }
      clearTimeout(timeout);
      resolve();
      return;
    }
    timeout = setTimeout(handleTimeout, 100);
  };
  for (const map of maps) {
    map.on('error', handleError);
    map.on('hashesloaded', handleHash);
    map.on('hash', handleHash);
  }
});
