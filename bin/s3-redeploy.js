#!/usr/bin/env node

require('../src/index')(require('../src/lib/args-processor').parseCmdArgs())
  .then(() => console.log('Execution complete'))
  .catch(err => {
    console.log('Execution failed');
    console.log(err);
    process.exit(1);
  });
