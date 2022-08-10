import { Config as PrismaConfig, Project as PrismaProject } from '@prisma/client';
import { z } from 'zod';

const ZConfigObject = z.object({ value: z.string().nullable(), hidden: z.boolean().optional() });

export const ZConfigValue = z.record(ZConfigObject);

export type ConfigValue = z.infer<typeof ZConfigValue>;
export type Config = Omit<PrismaConfig, 'values'> & { values: ConfigValue };

export type Project = PrismaProject;
export type ConfigProject = Project & { configs: Config[] };
