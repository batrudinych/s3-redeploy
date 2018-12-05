#!/usr/bin/env node
'use strict';

require('../src')(require('../src/lib/args-processor').parse(process.argv.slice(2)))
  .then(() => console.log('Execution complete'))
  .catch(err => {
    console.log('Execution failed:');
    console.log(err.message);
    process.exit(1);
  });
