console.log('Process type:', process.type);
console.log('Is main process:', process.type === 'browser');
try {
    const electron = require('electron');
    console.log('Electron value:', electron);
} catch (e) { }
process.exit(0);
