#!/usr/bin/env node

require('../src/index')(require('../src/lib/utils').parseCmdArgs())
  .then(() => console.log('Execution complete'))
  .catch(err => {
    console.log('Execution failed');
    console.log(err);
    process.exit(1);
  });
