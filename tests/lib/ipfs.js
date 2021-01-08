// @flow

const DaemonFactory = require('ipfsd-ctl');
const ipfsBin = require('go-ipfs-dep').path();
const ipfsHttpModule = require('ipfs-http-client');

let nodes:Array<Object> = [];
let pids: Array<number> = [];

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
  await factory.clean();
  for (const pid of pids) {
    process.kill(pid);
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.kill(pid);
  }
  nodes = [];
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
  for (const node of nodes) {
    const { addresses } = await node.id();
    nodes.filter((x) => x !== node).map((x) => x.swarm.connect(addresses[0]));
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

