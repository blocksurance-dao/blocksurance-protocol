# BLOCKSURANCE Protocol Hardhat Project

This project demonstrates an advanced Hardhat use case, and contracts
used by the BLOCKSURANCE DAO.

The project comes with a sample contracts, tests for those contracts, a sample script that deploys those contract, and an example of a task implementation, which simply lists the available accounts. It also comes with a variety of other tools, preconfigured to work with the project code.

Try running some of the following tasks:

```shell
git clone https://github.com/blocksurance-dao/blocksurance-protocol.git

npm install
npm run compile
npm run chain

# then in a new terminal window

npm run test
```

# Performance optimizations

For faster runs of your tests and scripts, consider skipping ts-node's type checking by setting the environment variable `TS_NODE_TRANSPILE_ONLY` to `1` in hardhat's environment. For more details see [the documentation](https://hardhat.org/guides/typescript.html#performance-optimizations).
