// Детач-спавнер: запускает процессы так, чтобы они пережили завершение
// вызывающей команды (двойной отрыв: detached + unref + setsid внутри).
// Использование: node spawn-detached.cjs <logfile> <cmd...>
const { spawn } = require('child_process');
const fs = require('fs');

const log = process.argv[2];
const cmd = process.argv[3];
const args = process.argv.slice(4);
const out = fs.openSync(log, 'a');

const child = spawn(cmd, args, {
  detached: true,
  stdio: ['ignore', out, out],
  cwd: '/home/z/my-project',
});
child.unref();
console.log(`detached pid=${child.pid} cmd=${cmd} ${args.join(' ')}`);
