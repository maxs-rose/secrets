#!/usr/bin/env node

import chalk from 'chalk';
import { program } from 'commander';
import { writeFileSync } from 'fs';
import fetch from 'node-fetch';
import ora from 'ora';
import { exit } from 'process';

program
  .name('Env Tree CLI')
  .description('CLI tool to download secrets from Env Tree')
  .version('1.0.4-pre')
  .argument('<projectId>', 'ID for project to get config from')
  .argument('<configId>', 'ID for config')
  .argument('<userEmail>', 'User email')
  .argument('<userToken>', 'User auth token')
  .option('-env', '.env file format (default)')
  .option('-json', 'JSON file format')
  .option('-json-grouped', 'JSON file format preserving property groups')
  .option('-d, --download-directory <directory>', 'Directory to download file to', '.')
  .option('-f, --filename <filename>', 'Filename for created secrets file (default .env)')
  .option('-u, --url <url>', 'URL of secret cloud', 'https://envtree.net/');

program.parse();

type FileType = 'env' | 'json';

const getFilename = (filename: string | undefined, downloadType: FileType) => {
  const trimmedName = filename?.trim();

  if (trimmedName) {
    return trimmedName;
  }
  if (downloadType === 'env') {
    return '.env';
  }
  return 'secrets.json';
};

const [projectId, configId, userEmail, userToken] = program.processedArgs;
const options = program.opts();
const type: FileType = options.Env ? 'env' : 'json';
const filename = getFilename(options.filename, type);
const filepath = `${options.downloadDirectory}/${filename}`;
const url = options.url;

let spinner = ora(
  `Getting configuration ${chalk.green(configId)} from ${chalk.green(url)} for project ${chalk.green(projectId)}`
).start();
const formData = JSON.stringify({ projectId, configId, type, userEmail, userToken });

fetch(`${url}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: formData })
  .catch((e) => {
    spinner.fail(`Failed to fetch config! Error: ${chalk.red(e.errno)}`);

    exit(1);
  })
  .then((res) => {
    if (res.status !== 200) {
      spinner.fail(`Failed to fetch a config with id ${chalk.red(configId)} for project ${chalk.red(projectId)}`);

      exit(1);
    }

    return res;
  })
  .then((res) => (type === 'env' ? res.text() : res.json()) as string | object)
  .then((data) => {
    spinner.succeed('Got configuration');

    spinner.start(`Writing secret file to ${filepath}`);
    return data;
  })
  .then((data) => {
    try {
      writeFileSync(filepath, type === 'env' ? (data as string) : JSON.stringify(data, null, '\t'));
      spinner.succeed();
    } catch (e: any) {
      spinner.fail(`Failed to write file: ${chalk.red(e.message)}`);

      exit(1);
    }
  });
