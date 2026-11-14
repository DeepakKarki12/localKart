import fs from "node:fs/promises";
import YAML from "yaml";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const response = await fetch("https://render.com/schema/render.yaml.json");
if (!response.ok) throw new Error("Could not fetch current Render schema.");
const schema = await response.json();
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const blueprint = YAML.parse(
  await fs.readFile(new URL("../render.yaml", import.meta.url), "utf8"),
);
if (!validate(blueprint)) {
  console.error(validate.errors);
  process.exitCode = 1;
} else
  console.log(
    "render.yaml passes the current Render JSON Schema. No infrastructure was created or changed.",
  );
