const path = require('path');
const fs = require('fs/promises');

async function main() {
  const dbgFile = process.argv[2];
  const dbg = JSON.parse(await fs.readFile(dbgFile)).buildInfo;
  const buildInfoFile = path.resolve(path.dirname(dbgFile), dbg);
  const buildInfo = JSON.parse(await fs.readFile(buildInfoFile));
  await fs.writeFile(`${path.parse(dbgFile).name}.input.json`, JSON.stringify(buildInfo.input, null, 4));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
