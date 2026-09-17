/**
 * PitchMint AWS CDK Infrastructure Stack
 * Defines VPC, ECS Fargate Service, ALB, and CloudWatch Log Group.
 */
export const stackConfig = {
  stackName: 'PitchMintBackendStack',
  region: process.env.AWS_REGION || 'us-east-1',
  cpu: 512,
  memoryLimitMiB: 1024,
  desiredCount: 2
};

export default stackConfig;
