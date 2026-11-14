import fs from "node:fs";
export function findMongod() {
  if (process.env.MONGOD_PATH) return process.env.MONGOD_PATH;
  if (process.env.MONGOMS_SYSTEM_BINARY)
    return process.env.MONGOMS_SYSTEM_BINARY;
  if (process.platform === "win32") {
    const root = "C:/Program Files/MongoDB/Server";
    if (fs.existsSync(root)) {
      const versions = fs
        .readdirSync(root)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) {
        const path = `${root}/${version}/bin/mongod.exe`;
        if (fs.existsSync(path)) return path;
      }
    }
  }
  return "mongod";
}
