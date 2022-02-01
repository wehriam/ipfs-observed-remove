// @flow

import * as matchers from 'jest-extended';
import { v4 as uuidv4 } from 'uuid';
import expect from 'expect';
import { getSwarm, closeAllNodes } from './lib/ipfs';
import { IpfsObservedRemoveSet } from '../src';
import { generateValue } from './lib/values';
import waitForHashing from './lib/wait-for-hashing';

expect.extend(matchers);

jest.setTimeout(30000);

let nodes = [];

describe('IPFS Set', () => {
  beforeAll(async () => {
    nodes = await getSwarm(2);
  });

  afterAll(async () => {
    await closeAllNodes();
  });

  test('Load from a hash', async () => {
    const topicA = uuidv4();
    const topicB = uuidv4();
    const A = generateValue();
    const B = generateValue();
    const C = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topicA, [A, B, C], { bufferPublishing: 0 });
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsObservedRemoveSet(nodes[0], topicB, undefined, { bufferPublishing: 0 });
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.has(A)).toEqual(true);
    expect(bob.has(B)).toEqual(true);
    expect(bob.has(C)).toEqual(true);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize sets', async () => {
    const topic = uuidv4();
    const X = generateValue();
    const Y = generateValue();
    const Z = generateValue();
    const alice: IpfsObservedRemoveSet<string> = new IpfsObservedRemoveSet(nodes[0], topic, undefined, { bufferPublishing: 0 });
    const bob: IpfsObservedRemoveSet<string> = new IpfsObservedRemoveSet(nodes[1], topic, undefined, { bufferPublishing: 0 });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    await new Promise((resolve) => setTimeout(resolve, 500));
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
    expect([...alice]).toIncludeSameMembers([X, Y, Z]);
    expect([...bob]).toIncludeSameMembers([X, Y, Z]);
    bob.delete(X);
    bob.delete(Y);
    bob.delete(Z);
    while (aliceDeleteCount !== 3 || bobDeleteCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect([...alice]).toIncludeSameMembers([]);
    expect([...bob]).toIncludeSameMembers([]);
    await alice.shutdown();
    await bob.shutdown();
  });


  test('Synchronize add and delete events', async () => {
    const topic = uuidv4();
    const X = generateValue();
    const Y = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topic, undefined, { bufferPublishing: 0 });
    const bob = new IpfsObservedRemoveSet(nodes[1], topic, undefined, { bufferPublishing: 0 });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    await new Promise((resolve) => setTimeout(resolve, 500));
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
    await bob.shutdown();
  });

  test('Automatically synchronize mixed sets', async () => {
    const topic = uuidv4();
    const A = generateValue();
    const B = generateValue();
    const C = generateValue();
    const X = generateValue();
    const Y = generateValue();
    const Z = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topic, [A, B, C], { bufferPublishing: 0 });
    const bob = new IpfsObservedRemoveSet(nodes[1], topic, [X, Y, Z], { bufferPublishing: 0 });
    await Promise.all([bob.readyPromise, alice.readyPromise]);
    await waitForHashing([alice, bob]);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Load from a hash (chunked)', async () => {
    const topicA = uuidv4();
    const topicB = uuidv4();
    const A = generateValue();
    const B = generateValue();
    const C = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topicA, [A, B, C], { bufferPublishing: 0, chunkPubSub: true });
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsObservedRemoveSet(nodes[0], topicB, undefined, { bufferPublishing: 0, chunkPubSub: true });
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.has(A)).toEqual(true);
    expect(bob.has(B)).toEqual(true);
    expect(bob.has(C)).toEqual(true);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize sets (chunked)', async () => {
    const topic = uuidv4();
    const X = generateValue();
    const Y = generateValue();
    const Z = generateValue();
    const alice: IpfsObservedRemoveSet<string> = new IpfsObservedRemoveSet(nodes[0], topic, undefined, { bufferPublishing: 0, chunkPubSub: true });
    const bob: IpfsObservedRemoveSet<string> = new IpfsObservedRemoveSet(nodes[1], topic, undefined, { bufferPublishing: 0, chunkPubSub: true });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    await new Promise((resolve) => setTimeout(resolve, 500));
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
    expect([...alice]).toIncludeSameMembers([X, Y, Z]);
    expect([...bob]).toIncludeSameMembers([X, Y, Z]);
    bob.delete(X);
    bob.delete(Y);
    bob.delete(Z);
    while (aliceDeleteCount !== 3 || bobDeleteCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect([...alice]).toIncludeSameMembers([]);
    expect([...bob]).toIncludeSameMembers([]);
    await alice.shutdown();
    await bob.shutdown();
  });


  test('Synchronize add and delete events (chunked)', async () => {
    const topic = uuidv4();
    const X = generateValue();
    const Y = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topic, undefined, { bufferPublishing: 0, chunkPubSub: true });
    const bob = new IpfsObservedRemoveSet(nodes[1], topic, undefined, { bufferPublishing: 0, chunkPubSub: true });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    await new Promise((resolve) => setTimeout(resolve, 500));
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
    await bob.shutdown();
  });

  test('Automatically synchronize mixed sets (chunked)', async () => {
    const topic = uuidv4();
    const A = generateValue();
    const B = generateValue();
    const C = generateValue();
    const X = generateValue();
    const Y = generateValue();
    const Z = generateValue();
    const alice = new IpfsObservedRemoveSet(nodes[0], topic, [A, B, C], { bufferPublishing: 0, chunkPubSub: true });
    const bob = new IpfsObservedRemoveSet(nodes[1], topic, [X, Y, Z], { bufferPublishing: 0, chunkPubSub: true });
    await Promise.all([bob.readyPromise, alice.readyPromise]);
    await waitForHashing([alice, bob]);
    await alice.shutdown();
    await bob.shutdown();
  });
});

