// @flow

const uuid = require('uuid');
const { getSwarm } = require('./lib/ipfs');
const { IpfsObservedRemoveSet } = require('../src');
const { generateValue } = require('./lib/values');
const expect = require('expect');

jest.setTimeout(30000);

let nodes = [];

describe('IPFS Set', () => {
  beforeAll(async () => {
    nodes = await getSwarm(2);
  });

  test('Load from a hash', async () => {
    const topicA = uuid.v4();
    const topicB = uuid.v4();
    const A = generateValue();
    const B = generateValue();
    const C = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topicA, [A, B, C]);
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsObservedRemoveSet(nodes[0], topicB);
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.has(A)).toEqual(true);
    expect(bob.has(B)).toEqual(true);
    expect(bob.has(C)).toEqual(true);
    await alice.shutdown();
    bob.shutdown();
  });

  test('Synchronize sets', async () => {
    const topic = uuid.v4();
    const X = generateValue();
    const Y = generateValue();
    const Z = generateValue();
    const alice: IpfsObservedRemoveSet<string> = new IpfsObservedRemoveSet(nodes[0], topic);
    const bob: IpfsObservedRemoveSet<string> = new IpfsObservedRemoveSet(nodes[1], topic);
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    let aliceAddCount = 0;
    let bobAddCount = 0;
    let aliceDeleteCount = 0;
    let bobDeleteCount = 0;
    alice.on('add', () => (aliceAddCount += 1));
    bob.on('add', () => (bobAddCount += 1));
    alice.on('delete', () => (aliceDeleteCount += 1));
    bob.on('delete', () => (bobDeleteCount += 1));
    alice.add(X);
    alice.add(Y);
    alice.add(Z);
    while (aliceAddCount !== 3 || bobAddCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect([...alice]).toEqual([X, Y, Z]);
    expect([...bob]).toEqual([X, Y, Z]);
    bob.delete(X);
    bob.delete(Y);
    bob.delete(Z);
    while (aliceDeleteCount !== 3 || bobDeleteCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect([...alice]).toEqual([]);
    expect([...bob]).toEqual([]);
    await alice.shutdown();
    bob.shutdown();
  });


  test('Synchronize add and delete events', async () => {
    const topic = uuid.v4();
    const X = generateValue();
    const Y = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topic);
    const bob = new IpfsObservedRemoveSet(nodes[1], topic);
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    alice.on('publish', (message) => {
      bob.process(message);
    });
    bob.on('publish', (message) => {
      alice.process(message);
    });
    const aliceAddXPromise = new Promise((resolve) => {
      alice.once('add', (value) => {
        expect(value).toEqual(X);
        resolve();
      });
    });
    const aliceDeleteXPromise = new Promise((resolve) => {
      alice.once('delete', (value) => {
        expect(value).toEqual(X);
        resolve();
      });
    });
    bob.add(X);
    await aliceAddXPromise;
    bob.delete(X);
    await aliceDeleteXPromise;
    const bobAddYPromise = new Promise((resolve) => {
      bob.once('add', (value) => {
        expect(value).toEqual(Y);
        resolve();
      });
    });
    const bobDeleteYPromise = new Promise((resolve) => {
      bob.once('delete', (value) => {
        expect(value).toEqual(Y);
        resolve();
      });
    });
    alice.add(Y);
    await bobAddYPromise;
    alice.delete(Y);
    await bobDeleteYPromise;
    await alice.shutdown();
    bob.shutdown();
  });

  test('Automatically synchronize mixed sets', async () => {
    const topic = uuid.v4();
    const A = generateValue();
    const B = generateValue();
    const C = generateValue();
    const X = generateValue();
    const Y = generateValue();
    const Z = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topic, [A, B, C]);
    await alice.readyPromise;
    const bob = new IpfsObservedRemoveSet(nodes[1], topic, [X, Y, Z]);
    await bob.readyPromise;
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(alice.dump()).toEqual(bob.dump());
    await alice.shutdown();
    bob.shutdown();
  });
});

