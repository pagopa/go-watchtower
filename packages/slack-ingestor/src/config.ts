export type ParserId = "amazon-q" | "opsgenie" | "email-sns";

export interface ChannelConfig {
  /** Slack channel ID (e.g. C0123ABCDEF) */
  channelId: string;
  /** UUID of the product in the DB */
  productId: string;
  /** UUID of the environment in the DB */
  environmentId: string;
  /** Which parser to use for messages in this channel */
  parserId: ParserId;
  /** Default AWS account ID -- required for parsers that don't extract it (Opsgenie) */
  defaultAwsAccountId: string;
  /** Default AWS region code -- used as fallback when parsing fails to extract region */
  defaultAwsRegion?: string | undefined;
}

/**
 * Channel registry -- edit this to add/remove channels.
 *
 * For each channel provide:
 * - channelId:           Slack channel ID (visible in channel URL or "Copy link")
 * - productId:           UUID from the go-watchtower products table
 * - environmentId:       UUID from the go-watchtower environments table
 * - parserId:            One of 'amazon-q' | 'opsgenie' | 'email-sns'
 * - defaultAwsAccountId: AWS account ID (required; used as fallback or primary depending on parser)
 * - defaultAwsRegion:    Optional fallback region code (e.g. 'eu-south-1')
 *
 * IMPORTANT: channelId, productId, environmentId must be configured before deployment.
 */
export const CHANNEL_REGISTRY: ChannelConfig[] = [
  // Example -- replace with real values:
  // {
  //   channelId:           'C0123ABCDEF',
  //   productId:           '018e1234-0000-7000-0000-000000000001',
  //   environmentId:       '018e1234-0000-7000-0000-000000000002',
  //   parserId:            'amazon-q',
  //   defaultAwsAccountId: '644374009812',
  //   defaultAwsRegion:    'eu-south-1',
  // },
  {
    channelId:           'C0585442Z39',
    productId:           'd0000000-0000-0000-0000-000000000001',
    environmentId:       'e0000000-0000-0000-0001-000000000001',
    parserId:            'opsgenie',
    defaultAwsAccountId: '350578575906',
    defaultAwsRegion:    'eu-south-1',
  },  
  {
    channelId:           'C03JJLHL5K8',
    productId:           'd0000000-0000-0000-0000-000000000001',
    environmentId:       'e0000000-0000-0000-0001-000000000002',
    parserId:            'amazon-q',
    defaultAwsAccountId: '644374009812',
    defaultAwsRegion:    'eu-south-1',
  },
];
