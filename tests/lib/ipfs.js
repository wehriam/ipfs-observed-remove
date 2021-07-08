// @flow

const DaemonFactory = require('ipfsd-ctl');
const { default: AbortController } = require('abort-controller');
const ipfsBin = require('go-ipfs-dep').path();
const ipfsHttpModule = require('ipfs-http-client');

let nodes:Array<Object> = [];
let pids: Array<number> = [];
let abortControllers: Array<AbortController> = [];

const factory = DaemonFactory.createFactory({
  type: 'go',
  test: true,
  ipfsBin,
  ipfsHttpModule,
  disposable: true,
  args: ['--enable-pubsub-experiment'],
});

module.exports.getGatewayIpfsNode = async (port:number) => {
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
  await daemon.api.id();
  const pid = await daemon.pid();
  pids.push(pid);
  return daemon.api;
};

module.exports.closeAllNodes = async () => {
  for (const abortController of abortControllers) {
    abortController.abort();
  }
  await factory.clean();
  nodes = [];
  abortControllers = [];
  pids = [];
};

const getIpfsNode = module.exports.getIpfsNode = async (bootstrap:Array<string> = []) => {
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
  await daemon.api.id();
  const pid = await daemon.pid();
  pids.push(pid);
  return daemon.api;
};

module.exports.getSwarm = async (count:number) => {
  if (nodes.length < count) {
    nodes = nodes.concat(await Promise.all(Array.from({ length: count - nodes.length }, getIpfsNode)));
  }
  if (count === 1) {
    return nodes;
  }
  const abortController = new AbortController();
  abortControllers.push(abortController);
  for (const node of nodes) {
    const { addresses } = await node.id({ signal: abortController.signal });
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
      const peers = await node.swarm.peers({ signal: abortController.signal });
      if (peers.length >= nodes.length - 1) {
        connectedNodes += 1;
      }
    }));
  }
  return nodes;
};

