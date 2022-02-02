// @flow

import { debounce } from 'lodash';
import { IpfsObservedRemoveMap, IpfsObservedRemoveSet, IpfsSignedObservedRemoveMap, IpfsSignedObservedRemoveSet } from '../../src';

export default async (maps: Array<IpfsObservedRemoveMap<string, any> | IpfsObservedRemoveSet<any> | IpfsSignedObservedRemoveMap<string, any> | IpfsSignedObservedRemoveSet<any>>) => new Promise((resolve, reject) => {
  let didResolve = false;
  const areEqual = async () => {
    if (didResolve) {
      return false;
    }
    for (const map of maps) {
      if (map.hashLoadQueue.pending > 0 || map.hashLoadQueue.size > 0) {
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
        if (map.hashLoadQueue.pending > 0 || map.hashLoadQueue.size > 0) {
          return false;
        }
      }
    } catch (error) {
      if (error.type === 'aborted') {
        // console.log('aborted');
        return false;
      }
      throw error;
    }
    return true;
  };
  const handleTimeout = async () => {
    if (didResolve) {
      return;
    }
    if (!(await areEqual())) {
      timeout = setTimeout(handleTimeout, 100);
      return;
    }
    for (const map of maps) {
      map.removeListener('error', handleError);
      map.removeListener('hashesloaded', handleHashesLoaded);
      map.removeListener('hash', handleHashesLoaded);
    }
    didResolve = true;
    resolve();
  };
  let timeout = setTimeout(handleTimeout, 100);
  const handleError = (error) => {
    if (didResolve) {
      return;
    }
    clearTimeout(timeout);
    for (const map of maps) {
      map.removeListener('error', handleError);
      map.removeListener('hashesloaded', handleHashesLoaded);
      map.removeListener('hash', handleHashesLoaded);
    }
    didResolve = true;
    reject(error);
  };
  const handleHashesLoaded = debounce(async () => {
    if (didResolve) {
      return;
    }
    clearTimeout(timeout);
    if (await areEqual()) {
      for (const map of maps) {
        map.removeListener('error', handleError);
        map.removeListener('hashesloaded', handleHashesLoaded);
        map.removeListener('hash', handleHashesLoaded);
      }
      clearTimeout(timeout);
      didResolve = true;
      resolve();
      return;
    }
    timeout = setTimeout(handleTimeout, 100);
  }, 100);
  for (const map of maps) {
    map.on('error', handleError);
    map.on('hashesloaded', handleHashesLoaded);
    map.on('hash', handleHashesLoaded);
  }
});
