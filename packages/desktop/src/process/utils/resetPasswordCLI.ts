/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reset password CLI utility for packaged applications
 * 打包应用的密码重置命令行工具
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDataPath } from '@process/utils';
// TODO M6-cleanup: Migrate to @aionui/web-host
// import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import path from 'path';

// 颜色输出 / Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}i${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}OK${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}ERR${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}WARN${colors.reset} ${msg}`),
  highlight: (msg: string) => console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

const hashPasswordAsync = (password: string, saltRounds: number): Promise<string> =>
  new Promise((resolve, reject) => {
    bcrypt.hash(password, saltRounds, (error, hash) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(hash);
    });
  });

// Hash password using bcrypt
// 使用 bcrypt 哈希密码
async function hashPassword(password: string): Promise<string> {
  return await hashPasswordAsync(password, 10);
}

// 生成随机密码 / Generate random password
function generatePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function resolveResetPasswordUsername(argv: string[]): string {
  const resetPasswordIndex = argv.indexOf('--resetpass');
  if (resetPasswordIndex === -1) {
    return 'admin';
  }

  const argsAfterCommand = argv.slice(resetPasswordIndex + 1);
  return argsAfterCommand.find((arg) => !arg.startsWith('--')) || 'admin';
}

/**
 * Reset password for a user (CLI mode, works in packaged apps)
 * 重置用户密码（CLI模式,在打包应用中可用）
 *
 * @param username - Username to reset password for
 */
export async function resetPasswordCLI(username: string): Promise<void> {
  // TODO M6-cleanup: Migrate to @aionui/web-host
  log.error('resetPasswordCLI not implemented - TODO M6-cleanup');
  log.info(`Target user: ${username} (feature disabled)`);
  log.info('');
  log.info('This feature depends on legacy webserver components that were removed in M6.');
  log.info('It will be re-implemented with @aionui/web-host in a future milestone.');
  process.exit(1);
}
