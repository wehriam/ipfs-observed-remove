// @flow

require('jest-extended');
const uuid = require('uuid');
const { getSwarm, closeAllNodes } = require('./lib/ipfs');
const { IpfsObservedRemoveMap } = require('../src');
const { generateValue } = require('./lib/values');
const expect = require('expect');
const waitForHashing = require('./lib/wait-for-hashing');

jest.setTimeout(30000);

let nodes = [];

describe('IPFS Map', () => {
  beforeAll(async () => {
    nodes = await getSwarm(2);
  });

  afterAll(async () => {
    await closeAllNodes();
  });

  test('Load from a hash', async () => {
    const topicA = uuid.v4();
    const topicB = uuid.v4();
    const keyA = uuid.v4();
    const keyB = uuid.v4();
    const keyC = uuid.v4();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const alice = new IpfsObservedRemoveMap(nodes[0], topicA, [[keyA, valueA], [keyB, valueB], [keyC, valueC]], { bufferPublishing: 0 });
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsObservedRemoveMap(nodes[0], topicB);
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.get(keyA)).toEqual(valueA);
    expect(bob.get(keyB)).toEqual(valueB);
    expect(bob.get(keyC)).toEqual(valueC);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize maps', async () => {
    const topic = uuid.v4();
    const keyX = uuid.v4();
    const keyY = uuid.v4();
    const keyZ = uuid.v4();
    const valueX = generateValue();
    const valueY = generateValue();
    const valueZ = generateValue();
    const alice: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { bufferPublishing: 0 });
    const bob: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { bufferPublishing: 0 });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    let aliceAddCount = 0;
    let bobAddCount = 0;
    let aliceDeleteCount = 0;
    let bobDeleteCount = 0;
    alice.on('set', () => (aliceAddCount += 1));
    bob.on('set', () => (bobAddCount += 1));
    alice.on('delete', () => (aliceDeleteCount += 1));
    bob.on('delete', () => (bobDeleteCount += 1));
    alice.set(keyX, valueX);
    alice.set(keyY, valueY);
    alice.set(keyZ, valueZ);
    while (aliceAddCount !== 3 || bobAddCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(alice.get(keyX)).toEqual(valueX);
    expect(alice.get(keyY)).toEqual(valueY);
    expect(alice.get(keyZ)).toEqual(valueZ);
    expect(bob.get(keyX)).toEqual(valueX);
    expect(bob.get(keyY)).toEqual(valueY);
    expect(bob.get(keyZ)).toEqual(valueZ);
    expect([...alice]).toIncludeSameMembers([[keyX, valueX], [keyY, valueY], [keyZ, valueZ]]);
    expect([...bob]).toIncludeSameMembers([[keyX, valueX], [keyY, valueY], [keyZ, valueZ]]);
    bob.delete(keyX);
    bob.delete(keyY);
    bob.delete(keyZ);
    while (aliceDeleteCount !== 3 || bobDeleteCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(alice.get(keyX)).toBeUndefined();
    expect(alice.get(keyY)).toBeUndefined();
    expect(alice.get(keyZ)).toBeUndefined();
    expect(bob.get(keyX)).toBeUndefined();
    expect(bob.get(keyY)).toBeUndefined();
    expect(bob.get(keyZ)).toBeUndefined();
    expect([...alice]).toIncludeSameMembers([]);
    expect([...bob]).toIncludeSameMembers([]);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize set and delete events', async () => {
    const topic = uuid.v4();
    const keyX = uuid.v4();
    const keyY = uuid.v4();
    const valueX = generateValue();
    const valueY = generateValue();
    const alice = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { bufferPublishing: 0 });
    const bob = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { bufferPublishing: 0 });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    const aliceSetXPromise = new Promise((resolve) => {
      alice.once('set', (key, value) => {
        expect(key).toEqual(keyX);
        expect(value).toEqual(valueX);
        resolve();
      });
    });
    const aliceDeleteXPromise = new Promise((resolve) => {
      alice.once('delete', (key, value) => {
        expect(key).toEqual(keyX);
        expect(value).toEqual(valueX);
        resolve();
      });
    });
    bob.set(keyX, valueX);
    await aliceSetXPromise;
    bob.delete(keyX);
    await aliceDeleteXPromise;
    const bobSetYPromise = new Promise((resolve) => {
      bob.once('set', (key, value) => {
        expect(key).toEqual(keyY);
        expect(value).toEqual(valueY);
        resolve();
      });
    });
    const bobDeleteYPromise = new Promise((resolve) => {
      bob.once('delete', (key, value) => {
        expect(key).toEqual(keyY);
        expect(value).toEqual(valueY);
        resolve();
      });
    });
    alice.set(keyY, valueY);
    await bobSetYPromise;
    alice.delete(keyY);
    await bobDeleteYPromise;
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize mixed maps using sync', async () => {
    const topic = uuid.v4();
    const keyA = uuid.v4();
    const keyB = uuid.v4();
    const keyC = uuid.v4();
    const keyX = uuid.v4();
    const keyY = uuid.v4();
    const keyZ = uuid.v4();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const valueX = generateValue();
    const valueY = generateValue();
    const valueZ = generateValue();
    const alice = new IpfsObservedRemoveMap(nodes[0], topic, [[keyA, valueA], [keyB, valueB], [keyC, valueC]], { bufferPublishing: 0 });
    const bob = new IpfsObservedRemoveMap(nodes[1], topic, [[keyX, valueX], [keyY, valueY], [keyZ, valueZ]], { bufferPublishing: 0 });
    await Promise.all([bob.readyPromise, alice.readyPromise]);
    await waitForHashing([alice, bob]);
    expect(alice.dump()).toEqual(bob.dump());
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Load from a hash (chunked)', async () => {
    const topicA = uuid.v4();
    const topicB = uuid.v4();
    const keyA = uuid.v4();
    const keyB = uuid.v4();
    const keyC = uuid.v4();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const alice = new IpfsObservedRemoveMap(nodes[0], topicA, [[keyA, valueA], [keyB, valueB], [keyC, valueC]], { chunkPubSub: true, bufferPublishing: 0 });
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsObservedRemoveMap(nodes[0], topicB, undefined, { chunkPubSub: true, bufferPublishing: 0 });
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.get(keyA)).toEqual(valueA);
    expect(bob.get(keyB)).toEqual(valueB);
    expect(bob.get(keyC)).toEqual(valueC);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize maps (chunked)', async () => {
    const topic = uuid.v4();
    const keyX = uuid.v4();
    const keyY = uuid.v4();
    const keyZ = uuid.v4();
    const valueX = generateValue();
    const valueY = generateValue();
    const valueZ = generateValue();
    const alice: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { chunkPubSub: true, bufferPublishing: 0 });
    const bob: IpfsObservedRemoveMap<string, Object> = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { chunkPubSub: true, bufferPublishing: 0 });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    let aliceAddCount = 0;
    let bobAddCount = 0;
    let aliceDeleteCount = 0;
    let bobDeleteCount = 0;
    alice.on('set', () => (aliceAddCount += 1));
    bob.on('set', () => (bobAddCount += 1));
    alice.on('delete', () => (aliceDeleteCount += 1));
    bob.on('delete', () => (bobDeleteCount += 1));
    alice.set(keyX, valueX);
    alice.set(keyY, valueY);
    alice.set(keyZ, valueZ);
    while (aliceAddCount !== 3 || bobAddCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(alice.get(keyX)).toEqual(valueX);
    expect(alice.get(keyY)).toEqual(valueY);
    expect(alice.get(keyZ)).toEqual(valueZ);
    expect(bob.get(keyX)).toEqual(valueX);
    expect(bob.get(keyY)).toEqual(valueY);
    expect(bob.get(keyZ)).toEqual(valueZ);
    expect([...alice]).toIncludeSameMembers([[keyX, valueX], [keyY, valueY], [keyZ, valueZ]]);
    expect([...bob]).toIncludeSameMembers([[keyX, valueX], [keyY, valueY], [keyZ, valueZ]]);
    bob.delete(keyX);
    bob.delete(keyY);
    bob.delete(keyZ);
    while (aliceDeleteCount !== 3 || bobDeleteCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(alice.get(keyX)).toBeUndefined();
    expect(alice.get(keyY)).toBeUndefined();
    expect(alice.get(keyZ)).toBeUndefined();
    expect(bob.get(keyX)).toBeUndefined();
    expect(bob.get(keyY)).toBeUndefined();
    expect(bob.get(keyZ)).toBeUndefined();
    expect([...alice]).toIncludeSameMembers([]);
    expect([...bob]).toIncludeSameMembers([]);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize set and delete events (chunked)', async () => {
    const topic = uuid.v4();
    const keyX = uuid.v4();
    const keyY = uuid.v4();
    const valueX = generateValue();
    const valueY = generateValue();
    const alice = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { chunkPubSub: true, bufferPublishing: 0 });
    const bob = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { chunkPubSub: true, bufferPublishing: 0 });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    const aliceSetXPromise = new Promise((resolve) => {
      alice.once('set', (key, value) => {
        expect(key).toEqual(keyX);
        expect(value).toEqual(valueX);
        resolve();
      });
    });
    const aliceDeleteXPromise = new Promise((resolve) => {
      alice.once('delete', (key, value) => {
        expect(key).toEqual(keyX);
        expect(value).toEqual(valueX);
        resolve();
      });
    });
    bob.set(keyX, valueX);
    await aliceSetXPromise;
    bob.delete(keyX);
    await aliceDeleteXPromise;
    const bobSetYPromise = new Promise((resolve) => {
      bob.once('set', (key, value) => {
        expect(key).toEqual(keyY);
        expect(value).toEqual(valueY);
        resolve();
      });
    });
    const bobDeleteYPromise = new Promise((resolve) => {
      bob.once('delete', (key, value) => {
        expect(key).toEqual(keyY);
        expect(value).toEqual(valueY);
        resolve();
      });
    });
    alice.set(keyY, valueY);
    await bobSetYPromise;
    alice.delete(keyY);
    await bobDeleteYPromise;
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize mixed maps using sync (chunked)', async () => {
    const topic = uuid.v4();
    const keyA = uuid.v4();
    const keyB = uuid.v4();
    const keyC = uuid.v4();
    const keyX = uuid.v4();
    const keyY = uuid.v4();
    const keyZ = uuid.v4();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const valueX = generateValue();
    const valueY = generateValue();
    const valueZ = generateValue();
    const alice = new IpfsObservedRemoveMap(nodes[0], topic, [[keyA, valueA], [keyB, valueB], [keyC, valueC]], { chunkPubSub: true, bufferPublishing: 0 });
    const bob = new IpfsObservedRemoveMap(nodes[1], topic, [[keyX, valueX], [keyY, valueY], [keyZ, valueZ]], { chunkPubSub: true, bufferPublishing: 0 });
    await Promise.all([bob.readyPromise, alice.readyPromise]);
    await waitForHashing([alice, bob]);
    expect(alice.dump()).toEqual(bob.dump());
    await alice.shutdown();
    await bob.shutdown();
  });
});
