// @flow

const uuid = require('uuid');
const { getSwarm, closeAllNodes } = require('./lib/ipfs');
const { getSigner, generateId, IpfsObservedRemoveMap, IpfsSignedObservedRemoveMap } = require('../src');
const expect = require('expect');

const NodeRSA = require('node-rsa');

jest.setTimeout(30000);

const privateKey = new NodeRSA({ b: 512 });
const sign = getSigner(privateKey.exportKey('pkcs1-private-pem'));
const publicKey = privateKey.exportKey('pkcs1-public-pem');

let nodes = [];

describe('IPFS Map', () => {
  beforeAll(async () => {
    nodes = await getSwarm(2);
  });

  afterAll(async () => {
    await closeAllNodes();
  });

  test('Loads a 10 MB value', async () => {
    const topic = uuid.v4();
    const key = uuid.v4();
    const value = {};
    for (let i = 0; i < 134500; i += 1) {
      value[uuid.v4()] = uuid.v4();
    }
    const alice = new IpfsObservedRemoveMap(nodes[0], topic, undefined, { chunkPubSub: true, disableSync: true, bufferPublishing: 0 });
    await alice.readyPromise;
    const bob = new IpfsObservedRemoveMap(nodes[1], topic, undefined, { chunkPubSub: true, disableSync: true, bufferPublishing: 0 });
    await bob.readyPromise;
    const aliceSetPromise = new Promise((resolve) => {
      alice.once('set', (k, v) => {
        expect(k).toEqual(key);
        expect(v).toEqual(value);
        resolve();
      });
    });
    bob.set(key, value);
    await aliceSetPromise;
    await alice.shutdown();
    await bob.shutdown();
  });

  test.skip('Loads a 10 MB value into a signed map', async () => {
    const topic = uuid.v4();
    const key = uuid.v4();
    const value = {};
    const id = generateId();
    for (let i = 0; i < 134500; i += 1) {
      value[uuid.v4()] = uuid.v4();
    }
    const alice = new IpfsSignedObservedRemoveMap(nodes[0], topic, [], { chunkPubSub: true, disableSync: true, bufferPublishing: 0, key: publicKey });
    await alice.readyPromise;
    const bob = new IpfsSignedObservedRemoveMap(nodes[1], topic, [], { chunkPubSub: true, disableSync: true, bufferPublishing: 0, key: publicKey });
    await bob.readyPromise;
    const aliceSetPromise = new Promise((resolve) => {
      alice.once('set', (k, v) => {
        expect(k).toEqual(key);
        expect(v).toEqual(value);
        resolve();
      });
    });
    bob.setSigned(key, value, id, sign(key, value, id));
    await aliceSetPromise;
    await alice.shutdown();
    await bob.shutdown();
  });
});

