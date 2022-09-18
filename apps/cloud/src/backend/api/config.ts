import { prisma } from '@backend/prisma';
import { Config as PrismaConfig } from '@prisma/client';
import * as trpc from '@trpc/server';
import { PrismaConfigWithParent, transformConfigs } from '@utils/backend/config';
import { encryptConfig } from '@utils/backend/crypt';
import {
  configNotFoundError,
  notFoundError,
  projectNotFoundError,
  unauthorizedError,
} from '@utils/backend/trpcErrorHelpers';
import { flattenConfigValues } from '@utils/shared/flattenConfig';
import { ConfigValue } from '@utils/shared/types';
import { randomBytes } from 'crypto';
import { from, map, switchMap } from 'rxjs';

const expandConfig = (config: PrismaConfig, projectConfigs: PrismaConfig[]) => {
  // Create a new object so we don't edit the original
  const result = { ...config } as PrismaConfigWithParent;

  // If it's a linked config try to find its parent
  // If the parent is not found set the linked parent to null
  if (config.linkedConfigId) {
    const parentConfig = projectConfigs.find((c) => c.id === config.linkedConfigId);

    if (parentConfig) {
      // Expand the parents parent configs
      const expandedParent = expandConfig(parentConfig, projectConfigs);
      result.linkedParent = expandedParent ?? null;
    } else {
      result.linkedParent = null;
    }
  }

  return result;
};

const getProjectConfig$ = (userId: string, projectId: string, configId: string) =>
  from(
    prisma.usersOnProject.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { project: { include: { configs: { include: { linkedParent: true } } } } },
    })
  ).pipe(
    map((foundProject) => {
      if (!foundProject) {
        throw projectNotFoundError;
      }

      const config = foundProject.project.configs.find((c) => c.id === configId);

      if (!config) {
        throw notFoundError('Target config was not found on project');
      }

      return config;
    })
  );

export const getExpandedConfigs$ = (userId: string, projectId: string) =>
  from(
    prisma.usersOnProject.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { project: { include: { configs: true } } },
    })
  ).pipe(
    map((res) => {
      if (!res) {
        throw unauthorizedError;
      }

      return res.project.configs;
    }),
    map((configs) => configs.map((config) => expandConfig(config, configs))),
    map(transformConfigs)
  );

export const createConfig$ = (userId: string, projectId: string, configName: string) =>
  from(
    prisma.usersOnProject.findUnique({ select: { project: true }, where: { projectId_userId: { projectId, userId } } })
  ).pipe(
    switchMap((foundProject) => {
      if (!foundProject) {
        throw unauthorizedError;
      }

      return prisma.config.create({ data: { projectId, name: configName, values: '' } });
    })
  );

export const duplicateConfig$ = (userId: string, projectId: string, targetConfigId: string, configName: string) =>
  getProjectConfig$(userId, projectId, targetConfigId).pipe(
    switchMap((config) =>
      prisma.config.create({
        data: {
          projectId,
          name: configName,
          values: config.values,
          linkedConfigId: config.linkedConfigId,
          linkedProjectConfigId: config.linkedProjectConfigId,
        },
      })
    )
  );

export const linkedConfig$ = (userId: string, projectId: string, targetConfigId: string, configName: string) =>
  getProjectConfig$(userId, projectId, targetConfigId).pipe(
    switchMap(() =>
      prisma.config.create({
        data: {
          projectId,
          name: configName,
          values: '',
          linkedProjectConfigId: projectId,
          linkedConfigId: targetConfigId,
        },
      })
    )
  );

export const unlinkConfig$ = (userId: string, projectId: string, configId: string, configVersion: string) => {
  return getExpandedConfigs$(userId, projectId).pipe(
    map((configs) => {
      const targetConfig = configs.find((c) => c.id === configId);

      if (!targetConfig) {
        throw configNotFoundError;
      }

      if (targetConfig.version !== configVersion) {
        throw new trpc.TRPCError({
          code: 'CONFLICT',
          message: 'Config version mismatch',
        });
      }

      return flattenConfigValues(targetConfig);
    }),
    map((values) => {
      return Object.entries(values).map(([k, v]) => {
        // The parent name and overrides don't make sense to exist here
        const { parentName, overrides, ...data } = v;
        return [k, data];
      });
    }),
    map(Object.fromEntries),
    switchMap((values) =>
      prisma.config.update({
        where: { id_projectId: { id: configId, projectId: projectId } },
        data: {
          values: encryptConfig(values),
          version: randomBytes(16).toString('hex'),
          linkedConfigId: null,
          linkedProjectConfigId: null,
        },
      })
    )
  );
};

export const updateConfig$ = (
  userId: string,
  projectId: string,
  configId: string,
  configVersion: string | null,
  configValue: ConfigValue
) =>
  getProjectConfig$(userId, projectId, configId).pipe(
    switchMap((config) => {
      if (config.version !== configVersion) {
        throw new trpc.TRPCError({
          code: 'CONFLICT',
          message: 'Config version mismatch',
        });
      }

      return prisma.config.update({
        where: { id_projectId: { id: configId, projectId: projectId } },
        data: { values: encryptConfig(configValue), version: randomBytes(16).toString('hex') },
      });
    })
  );

export const renameConfig$ = (
  userId: string,
  projectId: string,
  configId: string,
  configVersion: string | null,
  configName: string
) =>
  getProjectConfig$(userId, projectId, configId).pipe(
    switchMap((config) => {
      if (config.version !== configVersion) {
        throw new trpc.TRPCError({
          code: 'CONFLICT',
          message: 'Config version mismatch',
        });
      }

      return prisma.config.update({
        where: { id_projectId: { id: configId, projectId: projectId } },
        data: { name: configName, version: randomBytes(16).toString('hex') },
      });
    })
  );

export const deleteConfig$ = (userId: string, projectId: string, configId: string) =>
  getProjectConfig$(userId, projectId, configId).pipe(
    switchMap(() =>
      prisma.config.delete({
        where: {
          id_projectId: {
            projectId,
            id: configId,
          },
        },
      })
    )
  );
