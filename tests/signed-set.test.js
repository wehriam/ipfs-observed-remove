// @flow

import * as matchers from 'jest-extended';
import { v4 as uuidv4 } from 'uuid';
import expect from 'expect';
import NodeRSA from 'node-rsa';
import { getSwarm, closeAllNodes } from './lib/ipfs';
import { getSigner, generateId, IpfsSignedObservedRemoveSet, InvalidSignatureError } from '../src';
import { generateValue } from './lib/values';
import waitForHashing from './lib/wait-for-hashing';

expect.extend(matchers);

const privateKey = new NodeRSA({ b: 512 });
const sign = getSigner(privateKey.exportKey('pkcs1-private-pem'));
const key = privateKey.exportKey('pkcs1-public-pem');

jest.setTimeout(30000);

let nodes = [];

describe('IPFS Signed Set', () => {
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
    const idA = generateId();
    const idB = generateId();
    const idC = generateId();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topicA, [[A, idA, sign(A, idA)], [B, idB, sign(B, idB)], [C, idC, sign(C, idC)]], { bufferPublishing: 0, key });
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsSignedObservedRemoveSet(nodes[0], topicB, [], { bufferPublishing: 0, key });
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.has(A)).toEqual(true);
    expect(bob.has(B)).toEqual(true);
    expect(bob.has(C)).toEqual(true);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Throw on invalid signatures', async () => {
    const topic = uuidv4();
    let id;
    const A = generateValue();
    const set = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { bufferPublishing: 0, key });
    expect(() => {
      id = generateId();
      new IpfsSignedObservedRemoveSet(nodes[0], uuidv4(), [[A, id, '***']], { bufferPublishing: 0, key }); // eslint-disable-line no-new
    }).toThrowError(InvalidSignatureError);
    expect(() => {
      id = generateId();
      set.addSigned(A, id, '***');
    }).toThrowError(InvalidSignatureError);
    id = generateId();
    set.addSigned(A, id, sign(A, id));
    expect(() => {
      const ids = set.activeIds(A);
      ids.forEach((d) => set.deleteSignedId(d, '***'));
    }).toThrowError(InvalidSignatureError);
    await set.shutdown();
  });

  test('Emit errors on invalid synchronization', async () => {
    const topic = uuidv4();
    let id;
    let ids;
    const alicePrivateKey = new NodeRSA({ b: 512 });
    const aliceSign = getSigner(alicePrivateKey.exportKey('pkcs1-private-pem'));
    const aliceKey = alicePrivateKey.exportKey('pkcs1-public-pem');
    const bobPrivateKey = new NodeRSA({ b: 512 });
    const bobSign = getSigner(bobPrivateKey.exportKey('pkcs1-private-pem'));
    const bobKey = bobPrivateKey.exportKey('pkcs1-public-pem');
    const X = generateValue();
    const Y = generateValue();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { bufferPublishing: 0, key: aliceKey });
    const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [], { bufferPublishing: 0, key: bobKey });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const aliceProcessAddMessage = new Promise((resolve, reject) => {
      alice.once('error', reject);
      alice.once('add', resolve);
      id = generateId();
      bob.addSigned(X, id, bobSign(X, id));
    });
    await expect(aliceProcessAddMessage).rejects.toThrowError(InvalidSignatureError);
    const bobProcessAddMessage = new Promise((resolve, reject) => {
      bob.once('error', reject);
      bob.once('add', resolve);
      id = generateId();
      alice.addSigned(Y, id, aliceSign(Y, id));
    });
    await expect(bobProcessAddMessage).rejects.toThrowError(InvalidSignatureError);
    const aliceProcessDeleteMessage = new Promise((resolve, reject) => {
      alice.once('error', reject);
      alice.once('delete', resolve);
      ids = bob.activeIds(X);
      ids.forEach((d) => bob.deleteSignedId(d, bobSign(d)));
    });
    await expect(aliceProcessDeleteMessage).rejects.toThrowError(InvalidSignatureError);
    const bobProcessDeleteMessage = new Promise((resolve, reject) => {
      bob.once('error', reject);
      bob.once('delete', resolve);
      ids = alice.activeIds(Y);
      ids.forEach((d) => alice.deleteSignedId(d, aliceSign(d)));
    });
    await expect(bobProcessDeleteMessage).rejects.toThrowError(InvalidSignatureError);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize sets', async () => {
    const topic = uuidv4();
    const X = generateValue();
    const Y = generateValue();
    const Z = generateValue();
    const idX = generateId();
    const idY = generateId();
    const idZ = generateId();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [], { bufferPublishing: 0, key });
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
    alice.addSigned(X, idX, sign(X, idX));
    alice.addSigned(Y, idY, sign(Y, idY));
    alice.addSigned(Z, idZ, sign(Z, idZ));
    while (aliceAddCount !== 3 || bobAddCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect([...alice]).toIncludeSameMembers([X, Y, Z]);
    expect([...bob]).toIncludeSameMembers([X, Y, Z]);
    let ids = bob.activeIds(X);
    ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
    ids = bob.activeIds(Y);
    ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
    ids = bob.activeIds(Z);
    ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
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
    const idX = generateId();
    const idY = generateId();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [], { bufferPublishing: 0, key });
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
    bob.addSigned(X, idX, sign(X, idX));
    await aliceAddXPromise;
    let ids = bob.activeIds(X);
    ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
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
    alice.addSigned(Y, idY, sign(Y, idY));
    await bobAddYPromise;
    ids = alice.activeIds(Y);
    ids.forEach((d) => alice.deleteSignedId(d, sign(d)));
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
    const idA = generateId();
    const idB = generateId();
    const idC = generateId();
    const idX = generateId();
    const idY = generateId();
    const idZ = generateId();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [[A, idA, sign(A, idA)], [B, idB, sign(B, idB)], [C, idC, sign(C, idC)]], { bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [[X, idX, sign(X, idX)], [Y, idY, sign(Y, idY)], [Z, idZ, sign(Z, idZ)]], { bufferPublishing: 0, key });
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
    const idA = generateId();
    const idB = generateId();
    const idC = generateId();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topicA, [[A, idA, sign(A, idA)], [B, idB, sign(B, idB)], [C, idC, sign(C, idC)]], { chunkPubSub: true, bufferPublishing: 0, key });
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsSignedObservedRemoveSet(nodes[0], topicB, [], { chunkPubSub: true, bufferPublishing: 0, key });
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.has(A)).toEqual(true);
    expect(bob.has(B)).toEqual(true);
    expect(bob.has(C)).toEqual(true);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Throw on invalid signatures (chunked)', async () => {
    const topic = uuidv4();
    let id;
    const A = generateValue();
    const set = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
    expect(() => {
      id = generateId();
      new IpfsSignedObservedRemoveSet(nodes[0], uuidv4(), [[A, id, '***']], { chunkPubSub: true, bufferPublishing: 0, key }); // eslint-disable-line no-new
    }).toThrowError(InvalidSignatureError);
    expect(() => {
      id = generateId();
      set.addSigned(A, id, '***');
    }).toThrowError(InvalidSignatureError);
    id = generateId();
    set.addSigned(A, id, sign(A, id));
    expect(() => {
      const ids = set.activeIds(A);
      ids.forEach((d) => set.deleteSignedId(d, '***'));
    }).toThrowError(InvalidSignatureError);
    await set.shutdown();
  });

  test('Emit errors on invalid synchronization (chunked)', async () => {
    const topic = uuidv4();
    let id;
    let ids;
    const alicePrivateKey = new NodeRSA({ b: 512 });
    const aliceSign = getSigner(alicePrivateKey.exportKey('pkcs1-private-pem'));
    const aliceKey = alicePrivateKey.exportKey('pkcs1-public-pem');
    const bobPrivateKey = new NodeRSA({ b: 512 });
    const bobSign = getSigner(bobPrivateKey.exportKey('pkcs1-private-pem'));
    const bobKey = bobPrivateKey.exportKey('pkcs1-public-pem');
    const X = generateValue();
    const Y = generateValue();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { chunkPubSub: true, bufferPublishing: 0, key: aliceKey });
    const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [], { chunkPubSub: true, bufferPublishing: 0, key: bobKey });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const aliceProcessAddMessage = new Promise((resolve, reject) => {
      alice.once('error', reject);
      alice.once('add', resolve);
      id = generateId();
      bob.addSigned(X, id, bobSign(X, id));
    });
    await expect(aliceProcessAddMessage).rejects.toThrowError(InvalidSignatureError);
    const bobProcessAddMessage = new Promise((resolve, reject) => {
      bob.once('error', reject);
      bob.once('add', resolve);
      id = generateId();
      alice.addSigned(Y, id, aliceSign(Y, id));
    });
    await expect(bobProcessAddMessage).rejects.toThrowError(InvalidSignatureError);
    const aliceProcessDeleteMessage = new Promise((resolve, reject) => {
      alice.once('error', reject);
      alice.once('delete', resolve);
      ids = bob.activeIds(X);
      ids.forEach((d) => bob.deleteSignedId(d, bobSign(d)));
    });
    await expect(aliceProcessDeleteMessage).rejects.toThrowError(InvalidSignatureError);
    const bobProcessDeleteMessage = new Promise((resolve, reject) => {
      bob.once('error', reject);
      bob.once('delete', resolve);
      ids = alice.activeIds(Y);
      ids.forEach((d) => alice.deleteSignedId(d, aliceSign(d)));
    });
    await expect(bobProcessDeleteMessage).rejects.toThrowError(InvalidSignatureError);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize sets (chunked)', async () => {
    const topic = uuidv4();
    const X = generateValue();
    const Y = generateValue();
    const Z = generateValue();
    const idX = generateId();
    const idY = generateId();
    const idZ = generateId();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
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
    alice.addSigned(X, idX, sign(X, idX));
    alice.addSigned(Y, idY, sign(Y, idY));
    alice.addSigned(Z, idZ, sign(Z, idZ));
    while (aliceAddCount !== 3 || bobAddCount !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect([...alice]).toIncludeSameMembers([X, Y, Z]);
    expect([...bob]).toIncludeSameMembers([X, Y, Z]);
    let ids = bob.activeIds(X);
    ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
    ids = bob.activeIds(Y);
    ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
    ids = bob.activeIds(Z);
    ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
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
    const idX = generateId();
    const idY = generateId();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
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
    bob.addSigned(X, idX, sign(X, idX));
    await aliceAddXPromise;
    let ids = bob.activeIds(X);
    ids.forEach((d) => bob.deleteSignedId(d, sign(d)));
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
    alice.addSigned(Y, idY, sign(Y, idY));
    await bobAddYPromise;
    ids = alice.activeIds(Y);
    ids.forEach((d) => alice.deleteSignedId(d, sign(d)));
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
    const idA = generateId();
    const idB = generateId();
    const idC = generateId();
    const idX = generateId();
    const idY = generateId();
    const idZ = generateId();
    const alice = new IpfsSignedObservedRemoveSet(nodes[0], topic, [[A, idA, sign(A, idA)], [B, idB, sign(B, idB)], [C, idC, sign(C, idC)]], { chunkPubSub: true, bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveSet(nodes[1], topic, [[X, idX, sign(X, idX)], [Y, idY, sign(Y, idY)], [Z, idZ, sign(Z, idZ)]], { chunkPubSub: true, bufferPublishing: 0, key });
    await Promise.all([bob.readyPromise, alice.readyPromise]);
    await waitForHashing([alice, bob]);
    await alice.shutdown();
    await bob.shutdown();
  });
});

