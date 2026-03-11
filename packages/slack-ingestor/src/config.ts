export type ParserId = "amazon-q" | "opsgenie" | "email-sns";

export interface ChannelConfig {
  /** Human-readable label for logs (e.g. "SEND prod") */
  label: string;
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

  // SEND - prod
  {
    label:               'SEND / Produzione',
    channelId:           'C0585442Z39',
    productId:           'd0000000-0000-0000-0000-000000000001',
    environmentId:       'e0000000-0000-0000-0001-000000000001',
    parserId:            'opsgenie',
    defaultAwsAccountId: '350578575906',
    defaultAwsRegion:    'eu-south-1',
  },

  // SEND - UAT
  {
    label:               'SEND / UAT',
    channelId:           'C03JJLHL5K8',
    productId:           'd0000000-0000-0000-0000-000000000001',
    environmentId:       'e0000000-0000-0000-0001-000000000002',
    parserId:            'amazon-q',
    defaultAwsAccountId: '644374009812',
    defaultAwsRegion:    'eu-south-1',
  },

  // SEND - Building block (PROD)
  {
    label:               'SEND / Building Block',
    channelId:           'C0AGKJCMYDQ',
    productId:           'd0000000-0000-0000-0000-000000000001',
    environmentId:       'e0000000-0000-0000-0001-000000000001',
    parserId:            'email-sns',
    defaultAwsAccountId: '730335668132',
    defaultAwsRegion:    'eu-south-1',
  },

  // interop - PROD
  {
    label:               'Interop / Produzione',
    channelId:           'C0472QPG5D2',
    productId:           'd0000000-0000-0000-0000-000000000002',
    environmentId:       'e0000000-0000-0000-0002-000000000001',
    parserId:            'email-sns',
    defaultAwsAccountId: '697818730278',
    defaultAwsRegion:    'eu-south-1',
  },

  // interop - Attestazione
  {
    label:               'Interop / Attestazione',
    channelId:           'C06LQ7Y8B17',
    productId:           'd0000000-0000-0000-0000-000000000002',
    environmentId:       'e0000000-0000-0000-0002-000000000002',
    parserId:            'email-sns',
    defaultAwsAccountId: '533267098416',
    defaultAwsRegion:    'eu-south-1',
  },

  // interop - Collaudo
  {
    label:               'Interop / Collaudo',
    channelId:           'C04708Y1QP5',
    productId:           'd0000000-0000-0000-0000-000000000002',
    environmentId:       'e0000000-0000-0000-0002-000000000003',
    parserId:            'email-sns',
    defaultAwsAccountId: '895646477129',
    defaultAwsRegion:    'eu-south-1',
  },

  // interop - Catalog
  {
    label:               'Interop / Catalog',
    channelId:           'C09RVCSL4BS',
    productId:           'd0000000-0000-0000-0000-000000000002',
    environmentId:       'e0000000-0000-0000-0002-000000000004',
    parserId:            'email-sns',
    defaultAwsAccountId: '697818730278',
    defaultAwsRegion:    'eu-south-1',
  },
];
