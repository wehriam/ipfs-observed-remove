// @flow

import * as matchers from 'jest-extended';
import { v4 as uuidv4 } from 'uuid';
import expect from 'expect';
import { getSwarm, closeAllNodes } from './lib/ipfs';
import { IpfsObservedRemoveMap } from '../src';
import { generateValue } from './lib/values';

expect.extend(matchers);

jest.setTimeout(30000);

let nodes = [];

describe('IPFS Map', () => {
  beforeAll(async () => {
    nodes = await getSwarm(2);
  });

  afterAll(async () => {
    await closeAllNodes();
  });

  test('Sync values that are rapidly set', async () => {
    const topic = uuidv4();
    const key = uuidv4();
    const alice: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { bufferPublishing: 0, disableSync: true });
    await alice.readyPromise;
    const bob: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { bufferPublishing: 0, disableSync: true });
    await bob.readyPromise;
    await Promise.all([alice.waitForPeers(), bob.waitForPeers()]);
    let value;

    for (let i = 0; i < 50; i += 1) {
      value = generateValue();
      bob.set(key, value);
    }
    if (alice.get(key) !== value) {
      await new Promise((resolve) => {
        const handleSet = (k, v) => {
          if (key !== k) {
            return;
          }
          if (value !== v) {
            return;
          }
          alice.removeListener('set', handleSet);
          resolve();
        };
        alice.addListener('set', handleSet);
      });
    }
    expect(alice.get(key)).toEqual(bob.get(key));
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Sync values that are rapidly set (chunked)', async () => {
    const topic = uuidv4();
    const key = uuidv4();
    const alice: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { chunkPubSub: true, bufferPublishing: 0, disableSync: true });
    await alice.readyPromise;
    const bob: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { chunkPubSub: true, bufferPublishing: 0, disableSync: true });
    await bob.readyPromise;
    await Promise.all([alice.waitForPeers(), bob.waitForPeers()]);
    let value;
    for (let i = 0; i < 50; i += 1) {
      value = generateValue();
      bob.set(key, value);
    }
    if (alice.get(key) !== value) {
      await new Promise((resolve) => {
        const handleSet = (k, v) => {
          if (key !== k) {
            return;
          }
          if (value !== v) {
            return;
          }
          alice.removeListener('set', handleSet);
          resolve();
        };
        alice.addListener('set', handleSet);
      });
    }
    expect(alice.get(key)).toEqual(bob.get(key));
    await alice.shutdown();
    await bob.shutdown();
  });
});
