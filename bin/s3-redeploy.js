#!/usr/bin/env node
'use strict';

require('../src/index')(require('../src/lib/args-processing').parseCmdArgs())
  .then(() => console.log('Execution complete'))
  .catch(err => {
    console.log('Execution failed:');
    console.log(err.message);
    process.exit(1);
  });
