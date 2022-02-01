// @flow

import * as matchers from 'jest-extended';
import expect from 'expect';
import NodeRSA from 'node-rsa';
import { v4 as uuidv4 } from 'uuid';
import { getSwarm, closeAllNodes } from './lib/ipfs';
import { getSigner, generateId, IpfsSignedObservedRemoveMap, InvalidSignatureError } from '../src';
import { generateValue } from './lib/values';

import waitForHashing from './lib/wait-for-hashing';

expect.extend(matchers);

const privateKey = new NodeRSA({ b: 512 });
const sign = getSigner(privateKey.exportKey('pkcs1-private-pem'));
const key = privateKey.exportKey('pkcs1-public-pem');

jest.setTimeout(30000);

let nodes = [];

describe('IPFS Signed Map', () => {
  beforeAll(async () => {
    nodes = await getSwarm(2);
  });

  afterAll(async () => {
    await closeAllNodes();
  });

  test('Load from a hash', async () => {
    const topicA = uuidv4();
    const topicB = uuidv4();
    const keyA = uuidv4();
    const keyB = uuidv4();
    const keyC = uuidv4();
    const idA = generateId();
    const idB = generateId();
    const idC = generateId();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topicA, [[keyA, valueA, idA, sign(keyA, valueA, idA)], [keyB, valueB, idB, sign(keyB, valueB, idB)], [keyC, valueC, idC, sign(keyC, valueC, idC)]], { bufferPublishing: 0, key });
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsSignedObservedRemoveMap(nodes[0], topicB, [], { bufferPublishing: 0, key });
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.get(keyA)).toEqual(valueA);
    expect(bob.get(keyB)).toEqual(valueB);
    expect(bob.get(keyC)).toEqual(valueC);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Throw on invalid signatures', async () => {
    const topic = uuidv4();
    const keyA = uuidv4();
    const valueA = generateValue();
    const map = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { bufferPublishing: 0, key });
    expect(() => {
      new IpfsSignedObservedRemoveMap(nodes[0], uuidv4(), [[keyA, valueA, generateId(), '***']], { bufferPublishing: 0, key }); // eslint-disable-line no-new
    }).toThrowError(InvalidSignatureError);
    expect(() => {
      map.setSigned(keyA, valueA, generateId(), '***');
    }).toThrowError(InvalidSignatureError);
    const id = generateId();
    map.setSigned(keyA, valueA, id, sign(keyA, valueA, id));
    expect(() => {
      map.deleteSigned(keyA, id, '***');
    }).toThrowError(InvalidSignatureError);
    await map.shutdown();
  });

  test('Emit errors on invalid synchronization', async () => {
    const topic = uuidv4();
    const alicePrivateKey = new NodeRSA({ b: 512 });
    const aliceSign = getSigner(alicePrivateKey.exportKey('pkcs1-private-pem'));
    const aliceKey = alicePrivateKey.exportKey('pkcs1-public-pem');
    const bobPrivateKey = new NodeRSA({ b: 512 });
    const bobSign = getSigner(bobPrivateKey.exportKey('pkcs1-private-pem'));
    const bobKey = bobPrivateKey.exportKey('pkcs1-public-pem');
    const keyX = uuidv4();
    const keyY = uuidv4();
    const valueX = generateValue();
    const valueY = generateValue();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { bufferPublishing: 0, key: aliceKey });
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { bufferPublishing: 0, key: bobKey });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const id1 = generateId();
    const aliceProcessSetMessage = new Promise((resolve, reject) => {
      alice.once('error', reject);
      alice.once('set', resolve);
      bob.setSigned(keyX, valueX, id1, bobSign(keyX, valueX, id1));
    });
    await expect(aliceProcessSetMessage).rejects.toThrowError(InvalidSignatureError);
    const id2 = generateId();
    const bobProcessSetMessage = new Promise((resolve, reject) => {
      bob.once('error', reject);
      bob.once('set', resolve);
      alice.setSigned(keyY, valueY, id2, aliceSign(keyY, valueY, id2));
    });
    await expect(bobProcessSetMessage).rejects.toThrowError(InvalidSignatureError);
    const aliceProcessDeleteMessage = new Promise((resolve, reject) => {
      alice.once('error', reject);
      alice.once('delete', resolve);
      bob.deleteSigned(keyX, id1, bobSign(keyX, id1));
    });
    await expect(aliceProcessDeleteMessage).rejects.toThrowError(InvalidSignatureError);
    const bobProcessDeleteMessage = new Promise((resolve, reject) => {
      bob.once('error', reject);
      bob.once('delete', resolve);
      alice.deleteSigned(keyY, id2, bobSign(keyY, id2));
    });
    await expect(bobProcessDeleteMessage).rejects.toThrowError(InvalidSignatureError);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize maps', async () => {
    const topic = uuidv4();
    const keyX = uuidv4();
    const keyY = uuidv4();
    const keyZ = uuidv4();
    const valueX = generateValue();
    const valueY = generateValue();
    const valueZ = generateValue();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { bufferPublishing: 0, key });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    let aliceAddCount = 0;
    let bobAddCount = 0;
    let aliceDeleteCount = 0;
    let bobDeleteCount = 0;
    alice.on('set', () => (aliceAddCount += 1));
    bob.on('set', () => (bobAddCount += 1));
    alice.on('delete', () => (aliceDeleteCount += 1));
    bob.on('delete', () => (bobDeleteCount += 1));
    const id1 = generateId();
    alice.setSigned(keyX, valueX, id1, sign(keyX, valueX, id1));
    const id2 = generateId();
    alice.setSigned(keyY, valueY, id2, sign(keyY, valueY, id2));
    const id3 = generateId();
    alice.setSigned(keyZ, valueZ, id3, sign(keyZ, valueZ, id3));
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
    bob.deleteSigned(keyX, id1, sign(keyX, id1));
    bob.deleteSigned(keyY, id2, sign(keyY, id2));
    bob.deleteSigned(keyZ, id3, sign(keyZ, id3));
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
    const topic = uuidv4();
    const keyX = uuidv4();
    const keyY = uuidv4();
    const valueX = generateValue();
    const valueY = generateValue();
    const idX = generateId();
    const idY = generateId();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { bufferPublishing: 0, key });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    const aliceSetXPromise = new Promise((resolve) => {
      alice.once('set', (k, v) => {
        expect(k).toEqual(keyX);
        expect(v).toEqual(valueX);
        resolve();
      });
    });
    const aliceDeleteXPromise = new Promise((resolve) => {
      alice.once('delete', (k, v) => {
        expect(k).toEqual(keyX);
        expect(v).toEqual(valueX);
        resolve();
      });
    });
    bob.setSigned(keyX, valueX, idX, sign(keyX, valueX, idX));
    await aliceSetXPromise;
    bob.deleteSigned(keyX, idX, sign(keyX, idX));
    await aliceDeleteXPromise;
    const bobSetYPromise = new Promise((resolve) => {
      bob.once('set', (k, v) => {
        expect(k).toEqual(keyY);
        expect(v).toEqual(valueY);
        resolve();
      });
    });
    const bobDeleteYPromise = new Promise((resolve) => {
      bob.once('delete', (k, v) => {
        expect(k).toEqual(keyY);
        expect(v).toEqual(valueY);
        resolve();
      });
    });
    alice.setSigned(keyY, valueY, idY, sign(keyY, valueY, idY));
    await bobSetYPromise;
    alice.deleteSigned(keyY, idY, sign(keyY, idY));
    await bobDeleteYPromise;
    await alice.shutdown();
    await bob.shutdown();
  });


  test('Synchronize mixed maps using sync', async () => {
    const topic = uuidv4();
    const keyA = uuidv4();
    const keyB = uuidv4();
    const keyC = uuidv4();
    const keyX = uuidv4();
    const keyY = uuidv4();
    const keyZ = uuidv4();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const valueX = generateValue();
    const valueY = generateValue();
    const valueZ = generateValue();
    const idA = generateId();
    const idB = generateId();
    const idC = generateId();
    const idX = generateId();
    const idY = generateId();
    const idZ = generateId();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [[keyA, valueA, idA, sign(keyA, valueA, idA)], [keyB, valueB, idB, sign(keyB, valueB, idB)], [keyC, valueC, idC, sign(keyC, valueC, idC)]], { bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [[keyX, valueX, idX, sign(keyX, valueX, idX)], [keyY, valueY, idY, sign(keyY, valueY, idY)], [keyZ, valueZ, idZ, sign(keyZ, valueZ, idZ)]], { bufferPublishing: 0, key });
    await Promise.all([bob.readyPromise, alice.readyPromise]);
    await waitForHashing([alice, bob]);
    expect(alice.dump()).toEqual(bob.dump());
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Load from a hash (chunked)', async () => {
    const topicA = uuidv4();
    const topicB = uuidv4();
    const keyA = uuidv4();
    const keyB = uuidv4();
    const keyC = uuidv4();
    const idA = generateId();
    const idB = generateId();
    const idC = generateId();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topicA, [[keyA, valueA, idA, sign(keyA, valueA, idA)], [keyB, valueB, idB, sign(keyB, valueB, idB)], [keyC, valueC, idC, sign(keyC, valueC, idC)]], { chunkPubSub: true, bufferPublishing: 0, key });
    await alice.readyPromise;
    const hash = await alice.getIpfsHash();
    const bob = new IpfsSignedObservedRemoveMap(nodes[0], topicB, [], { chunkPubSub: true, bufferPublishing: 0, key });
    await bob.readyPromise;
    await bob.loadIpfsHash(hash);
    expect(bob.get(keyA)).toEqual(valueA);
    expect(bob.get(keyB)).toEqual(valueB);
    expect(bob.get(keyC)).toEqual(valueC);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Throw on invalid signatures (chunked)', async () => {
    const topic = uuidv4();
    const keyA = uuidv4();
    const valueA = generateValue();
    const map = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
    expect(() => {
      new IpfsSignedObservedRemoveMap(nodes[0], uuidv4(), [[keyA, valueA, generateId(), '***']], { chunkPubSub: true, bufferPublishing: 0, key }); // eslint-disable-line no-new
    }).toThrowError(InvalidSignatureError);
    expect(() => {
      map.setSigned(keyA, valueA, generateId(), '***');
    }).toThrowError(InvalidSignatureError);
    const id = generateId();
    map.setSigned(keyA, valueA, id, sign(keyA, valueA, id));
    expect(() => {
      map.deleteSigned(keyA, id, '***');
    }).toThrowError(InvalidSignatureError);
    await map.shutdown();
  });

  test('Emit errors on invalid synchronization (chunked)', async () => {
    const topic = uuidv4();
    const alicePrivateKey = new NodeRSA({ b: 512 });
    const aliceSign = getSigner(alicePrivateKey.exportKey('pkcs1-private-pem'));
    const aliceKey = alicePrivateKey.exportKey('pkcs1-public-pem');
    const bobPrivateKey = new NodeRSA({ b: 512 });
    const bobSign = getSigner(bobPrivateKey.exportKey('pkcs1-private-pem'));
    const bobKey = bobPrivateKey.exportKey('pkcs1-public-pem');
    const keyX = uuidv4();
    const keyY = uuidv4();
    const valueX = generateValue();
    const valueY = generateValue();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { chunkPubSub: true, bufferPublishing: 0, key: aliceKey });
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { chunkPubSub: true, bufferPublishing: 0, key: bobKey });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const id1 = generateId();
    const aliceProcessSetMessage = new Promise((resolve, reject) => {
      alice.once('error', reject);
      alice.once('set', resolve);
      bob.setSigned(keyX, valueX, id1, bobSign(keyX, valueX, id1));
    });
    await expect(aliceProcessSetMessage).rejects.toThrowError(InvalidSignatureError);
    const id2 = generateId();
    const bobProcessSetMessage = new Promise((resolve, reject) => {
      bob.once('error', reject);
      bob.once('set', resolve);
      alice.setSigned(keyY, valueY, id2, aliceSign(keyY, valueY, id2));
    });
    await expect(bobProcessSetMessage).rejects.toThrowError(InvalidSignatureError);
    const aliceProcessDeleteMessage = new Promise((resolve, reject) => {
      alice.once('error', reject);
      alice.once('delete', resolve);
      bob.deleteSigned(keyX, id1, bobSign(keyX, id1));
    });
    await expect(aliceProcessDeleteMessage).rejects.toThrowError(InvalidSignatureError);
    const bobProcessDeleteMessage = new Promise((resolve, reject) => {
      bob.once('error', reject);
      bob.once('delete', resolve);
      alice.deleteSigned(keyY, id2, bobSign(keyY, id2));
    });
    await expect(bobProcessDeleteMessage).rejects.toThrowError(InvalidSignatureError);
    await alice.shutdown();
    await bob.shutdown();
  });

  test('Synchronize maps  (chunked)', async () => {
    const topic = uuidv4();
    const keyX = uuidv4();
    const keyY = uuidv4();
    const keyZ = uuidv4();
    const valueX = generateValue();
    const valueY = generateValue();
    const valueZ = generateValue();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    let aliceAddCount = 0;
    let bobAddCount = 0;
    let aliceDeleteCount = 0;
    let bobDeleteCount = 0;
    alice.on('set', () => (aliceAddCount += 1));
    bob.on('set', () => (bobAddCount += 1));
    alice.on('delete', () => (aliceDeleteCount += 1));
    bob.on('delete', () => (bobDeleteCount += 1));
    const id1 = generateId();
    alice.setSigned(keyX, valueX, id1, sign(keyX, valueX, id1));
    const id2 = generateId();
    alice.setSigned(keyY, valueY, id2, sign(keyY, valueY, id2));
    const id3 = generateId();
    alice.setSigned(keyZ, valueZ, id3, sign(keyZ, valueZ, id3));
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
    bob.deleteSigned(keyX, id1, sign(keyX, id1));
    bob.deleteSigned(keyY, id2, sign(keyY, id2));
    bob.deleteSigned(keyZ, id3, sign(keyZ, id3));
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
    const topic = uuidv4();
    const keyX = uuidv4();
    const keyY = uuidv4();
    const valueX = generateValue();
    const valueY = generateValue();
    const idX = generateId();
    const idY = generateId();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { chunkPubSub: true, bufferPublishing: 0, key });
    await Promise.all([alice.readyPromise, bob.readyPromise]);
    const aliceSetXPromise = new Promise((resolve) => {
      alice.once('set', (k, v) => {
        expect(k).toEqual(keyX);
        expect(v).toEqual(valueX);
        resolve();
      });
    });
    const aliceDeleteXPromise = new Promise((resolve) => {
      alice.once('delete', (k, v) => {
        expect(k).toEqual(keyX);
        expect(v).toEqual(valueX);
        resolve();
      });
    });
    bob.setSigned(keyX, valueX, idX, sign(keyX, valueX, idX));
    await aliceSetXPromise;
    bob.deleteSigned(keyX, idX, sign(keyX, idX));
    await aliceDeleteXPromise;
    const bobSetYPromise = new Promise((resolve) => {
      bob.once('set', (k, v) => {
        expect(k).toEqual(keyY);
        expect(v).toEqual(valueY);
        resolve();
      });
    });
    const bobDeleteYPromise = new Promise((resolve) => {
      bob.once('delete', (k, v) => {
        expect(k).toEqual(keyY);
        expect(v).toEqual(valueY);
        resolve();
      });
    });
    alice.setSigned(keyY, valueY, idY, sign(keyY, valueY, idY));
    await bobSetYPromise;
    alice.deleteSigned(keyY, idY, sign(keyY, idY));
    await bobDeleteYPromise;
    await alice.shutdown();
    await bob.shutdown();
  });


  test('Synchronize mixed maps using sync (chunked)', async () => {
    const topic = uuidv4();
    const keyA = uuidv4();
    const keyB = uuidv4();
    const keyC = uuidv4();
    const keyX = uuidv4();
    const keyY = uuidv4();
    const keyZ = uuidv4();
    const valueA = generateValue();
    const valueB = generateValue();
    const valueC = generateValue();
    const valueX = generateValue();
    const valueY = generateValue();
    const valueZ = generateValue();
    const idA = generateId();
    const idB = generateId();
    const idC = generateId();
    const idX = generateId();
    const idY = generateId();
    const idZ = generateId();
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [[keyA, valueA, idA, sign(keyA, valueA, idA)], [keyB, valueB, idB, sign(keyB, valueB, idB)], [keyC, valueC, idC, sign(keyC, valueC, idC)]], { chunkPubSub: true, bufferPublishing: 0, key });
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [[keyX, valueX, idX, sign(keyX, valueX, idX)], [keyY, valueY, idY, sign(keyY, valueY, idY)], [keyZ, valueZ, idZ, sign(keyZ, valueZ, idZ)]], { chunkPubSub: true, bufferPublishing: 0, key });
    await Promise.all([bob.readyPromise, alice.readyPromise]);
    await waitForHashing([alice, bob]);
    expect(alice.dump()).toEqual(bob.dump());
    await alice.shutdown();
    await bob.shutdown();
  });
});

