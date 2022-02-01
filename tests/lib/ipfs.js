// @flow

import DaemonFactory from 'ipfsd-ctl';
import { create } from 'ipfs-http-client';
import { Agent } from 'http';
import { path as ipfsBinPath } from 'go-ipfs';


let nodes:Array<Object> = [];
let pids: Array<number> = [];
let abortControllers: Array<AbortController> = [];

const factory = DaemonFactory.createFactory({
  type: 'go',
  test: true,
  ipfsBin: ipfsBinPath(),
  ipfsHttpModule: {
    create: (url) => {
      const options: Object = {
        url,
        agent: new Agent({ keepAlive: true, maxSockets: Infinity }),
      };
      return create(options);
    },
  },
  disposable: true,
  args: ['--enable-pubsub-experiment'],
});

export const getGatewayIpfsNode = async (port:number) => {
  const options = {
    ipfsOptions: {
      config: {
        Experimental: {
          FilestoreEnabled: true,
          Libp2pStreamMounting: true,
        },
        Bootstrap: [],
        Addresses: {
          Gateway: `/ip4/127.0.0.1/tcp/${port}`,
          Swarm: [
            '/ip4/0.0.0.0/tcp/0',
            '/ip6/::/tcp/0',
          ],
        },
        Pubsub: {
          Enabled: true,
        },
        Discovery: {
          MDNS: {
            Interval: 1,
            Enabled: false,
          },
        },
      },
    },
  };
  const daemon = await factory.spawn(options);
  const { id } = await daemon.api.id();
  daemon.api.ipfsId = id;
  const pid = await daemon.pid();
  pids.push(pid);
  return daemon.api;
};

export const closeAllNodes = async () => {
  for (const abortController of abortControllers) {
    abortController.abort();
  }
  await factory.clean();
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGINT');
      await new Promise((resolve) => setTimeout(resolve, 100));
      process.kill(pid, 'SIGINT');
    } catch (error) {
      if (error.code === 'ESRCH') {
        continue;
      }
      throw error;
    }
  }
  nodes = [];
  abortControllers = [];
  pids = [];
};

export const getIpfsNode = async (bootstrap:Array<string> = []) => {
  const options = {
    ipfsOptions: {
      config: {
        Experimental: {
          FilestoreEnabled: true,
          Libp2pStreamMounting: true,
        },
        Bootstrap: bootstrap,
        Addresses: {
          Swarm: [
            '/ip4/0.0.0.0/tcp/0',
            '/ip6/::/tcp/0',
          ],
        },
        Pubsub: {
          Enabled: true,
        },
        Discovery: {
          MDNS: {
            Interval: 1,
            Enabled: false,
          },
        },
      },
    },
  };
  const abortController = new AbortController();
  abortControllers.push(abortController);
  const daemon = await factory.spawn(options);
  const { id } = await daemon.api.id();
  daemon.api.ipfsId = id;
  const pid = await daemon.pid();
  pids.push(pid);
  daemon.api.abortControllerSignal = abortController.signal;
  return daemon.api;
};

export const getSwarm = async (count:number) => {
  if (nodes.length < count) {
    nodes = nodes.concat(await Promise.all(Array.from({ length: count - nodes.length }, getIpfsNode)));
  }
  if (count === 1) {
    return nodes;
  }
  const abortController = new AbortController();
  abortControllers.push(abortController);
  for (const node of nodes) {
    const { addresses } = await node.id();
    nodes.filter((x) => x !== node).forEach((x) => {
      x.swarm.connect(addresses[0], { signal: abortController.signal }).catch(() => {
        // This is a no-op because we are checking for the connected nodes in the next step
      });
    });
  }
  let connectedNodes = 0;
  while (connectedNodes < count) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    connectedNodes = 0;
    await Promise.all(nodes.map(async (node) => { // eslint-disable-line no-loop-func
      const peers = await node.swarm.peers();
      if (peers.length >= nodes.length - 1) {
        connectedNodes += 1;
      }
    }));
  }
  return nodes;
};

