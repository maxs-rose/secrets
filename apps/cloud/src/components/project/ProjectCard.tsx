import { Avatar, Card, Grid, Text } from '@geist-ui/core';
import { ProjectPage } from '@utils/shared/types';
import Link from 'next/link';
import React from 'react';

export const ProjectCard: React.FC<{ project: ProjectPage }> = ({ project }) => {
  const linkTarget = `/projects/${project.id}`;

  return (
    <Grid>
      <Link href={linkTarget} passHref>
        <a>
          <Card hoverable className="!w-[24rem]">
            <Text h4 className="max-w-sm break-words">
              {project.name}
            </Text>
            <Text className="max-w-sm break-words">{project.description ?? 'No description'}</Text>
            <Avatar.Group count={project.userIcons.length > 10 ? project.userIcons.length - 10 : undefined}>
              {project.userIcons.slice(0, 10).map((l) => (
                <Avatar key={l} src={l} stacked />
              ))}
            </Avatar.Group>
          </Card>
        </a>
      </Link>
    </Grid>
  );
};
