/**
 * Maps AWS region display labels (as they appear in CloudWatch/SNS notifications)
 * to their canonical region codes.
 */
export const AWS_REGION_LABEL_MAP: Record<string, string> = {
  "EU (Milan)": "eu-south-1",
  "EU (Ireland)": "eu-west-1",
  "EU (Frankfurt)": "eu-central-1",
  "EU (Paris)": "eu-west-3",
  "EU (Stockholm)": "eu-north-1",
  "EU (London)": "eu-west-2",
  "EU (Spain)": "eu-south-2",
  "EU (Zurich)": "eu-central-2",
  "US East (N. Virginia)": "us-east-1",
  "US East (Ohio)": "us-east-2",
  "US West (N. California)": "us-west-1",
  "US West (Oregon)": "us-west-2",
  "AP (Tokyo)": "ap-northeast-1",
  "AP (Seoul)": "ap-northeast-2",
  "AP (Singapore)": "ap-southeast-1",
  "AP (Sydney)": "ap-southeast-2",
  "SA (S\u00e3o Paulo)": "sa-east-1",
};

export function resolveRegion(
  label: string,
  fallback?: string,
): string | null {
  return AWS_REGION_LABEL_MAP[label] ?? fallback ?? null;
}
