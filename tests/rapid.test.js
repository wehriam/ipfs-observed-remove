// @flow

require('jest-extended');
const uuid = require('uuid');
const { getSwarm, closeAllNodes } = require('./lib/ipfs');
const { IpfsObservedRemoveMap } = require('../src');
const { generateValue } = require('./lib/values');
const expect = require('expect');

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
    const topic = uuid.v4();
    const key = uuid.v4();
    const alice: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { bufferPublishing: 0, disableSync: true });
    const bob: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { bufferPublishing: 0, disableSync: true });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    for (let i = 0; i < 1000; i += 1) {
      const value = generateValue();
      bob.set(key, value);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(alice.get(key)).toEqual(bob.get(key));
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Sync values that are rapidly set (chunked)', async () => {
    const topic = uuid.v4();
    const key = uuid.v4();
    const alice: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { chunkPubSub: true, bufferPublishing: 0, disableSync: true });
    const bob: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { chunkPubSub: true, bufferPublishing: 0, disableSync: true });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    for (let i = 0; i < 100; i += 1) {
      const value = generateValue();
      bob.set(key, value);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(alice.get(key)).toEqual(bob.get(key));
    await alice.shutdown();
    await bob.shutdown();
  });
});
