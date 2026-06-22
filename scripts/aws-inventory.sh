#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only AWS inventory for the production resources used by Go Watchtower.
# The script only invokes AWS list/describe/get APIs and never retrieves secret
# values, decrypted SSM parameters, EC2 user data, or Lambda environment values.

umask 077
export AWS_PAGER=""

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

AWS_PROFILE_NAME="${AWS_PROFILE:-sso_pn-analytics}"
AWS_REGION_NAME="${AWS_REGION:-eu-south-1}"
EC2_INSTANCE_ID="${EC2_INSTANCE_ID:-i-0a00edd84e29e8098}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-go-watchtower-slack-ingestor}"
CLOUDFRONT_DOMAIN="${CLOUDFRONT_DOMAIN:-d2xwbj6sp8axq2.cloudfront.net}"
OUTPUT_DIR=""
AUTO_SSO_LOGIN=true
OPTIONAL_FAILURES=0
ERROR_LOG=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Create a read-only snapshot of the AWS resources used by Go Watchtower.

Options:
  --profile NAME              AWS CLI profile (default: $AWS_PROFILE_NAME)
  --region REGION             AWS region (default: $AWS_REGION_NAME)
  --instance-id ID            EC2 instance ID (default: $EC2_INSTANCE_ID)
  --lambda-function NAME      Lambda name (default: $LAMBDA_FUNCTION_NAME)
  --cloudfront-domain DOMAIN  CloudFront domain (default: $CLOUDFRONT_DOMAIN)
  --output-dir DIR            Destination directory
  --no-sso-login              Do not run 'aws sso login' if auth is expired
  -h, --help                  Show this help

Environment variables with the same names can also set the defaults:
  AWS_PROFILE, AWS_REGION, EC2_INSTANCE_ID, LAMBDA_FUNCTION_NAME,
  CLOUDFRONT_DOMAIN

The default destination is:
  artifacts/aws-inventory/<UTC timestamp>

Exit codes:
  0  Complete inventory
  1  Invalid input, missing dependency, or authentication failure
  2  Inventory completed with one or more unavailable optional sections
EOF
}

log_info() {
  printf '[%s] INFO  %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

log_warn() {
  printf '[%s] WARN  %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

log_error() {
  printf '[%s] ERROR %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

die() {
  log_error "$*"
  exit 1
}

require_option_value() {
  local option="$1"
  local value="${2:-}"
  [[ -n "$value" && "$value" != --* ]] || die "$option requires a value"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      require_option_value "$1" "${2:-}"
      AWS_PROFILE_NAME="$2"
      shift 2
      ;;
    --region)
      require_option_value "$1" "${2:-}"
      AWS_REGION_NAME="$2"
      shift 2
      ;;
    --instance-id)
      require_option_value "$1" "${2:-}"
      EC2_INSTANCE_ID="$2"
      shift 2
      ;;
    --lambda-function)
      require_option_value "$1" "${2:-}"
      LAMBDA_FUNCTION_NAME="$2"
      shift 2
      ;;
    --cloudfront-domain)
      require_option_value "$1" "${2:-}"
      CLOUDFRONT_DOMAIN="$2"
      shift 2
      ;;
    --output-dir)
      require_option_value "$1" "${2:-}"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --no-sso-login)
      AUTO_SSO_LOGIN=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[[ $# -eq 0 ]] || die "unexpected positional arguments: $*"
[[ "$EC2_INSTANCE_ID" =~ ^i-[[:xdigit:]]+$ ]] || die "invalid EC2 instance ID: $EC2_INSTANCE_ID"
[[ "$AWS_REGION_NAME" =~ ^[a-z]{2}(-[a-z]+)+-[0-9]+$ ]] || die "invalid AWS region: $AWS_REGION_NAME"
[[ "$CLOUDFRONT_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "invalid CloudFront domain"

for command_name in aws jq; do
  command -v "$command_name" >/dev/null 2>&1 || die "missing dependency: $command_name"
done

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$REPO_ROOT/artifacts/aws-inventory/$(date -u +'%Y%m%dT%H%M%SZ')"
elif [[ "$OUTPUT_DIR" != /* ]]; then
  OUTPUT_DIR="$REPO_ROOT/$OUTPUT_DIR"
fi

if [[ -d "$OUTPUT_DIR" && -n "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
  die "output directory is not empty: $OUTPUT_DIR"
fi

mkdir -p "$OUTPUT_DIR"
ERROR_LOG="$OUTPUT_DIR/errors.log"
: > "$ERROR_LOG"

on_error() {
  local status=$?
  local line="${BASH_LINENO[0]:-unknown}"
  log_error "unexpected failure at line $line (exit $status); partial output: $OUTPUT_DIR"
  exit "$status"
}
trap on_error ERR

write_unavailable() {
  local target="$1"
  local section="$2"
  jq -n --arg section "$section" '{inventoryStatus:"unavailable", section:$section}' > "$target"
}

aws_capture() {
  local section="$1"
  local target="$2"
  shift 2

  local temporary="${target}.tmp"
  log_info "Collecting $section"
  if aws "$@" \
    --profile "$AWS_PROFILE_NAME" \
    --region "$AWS_REGION_NAME" \
    --output json > "$temporary" 2>> "$ERROR_LOG"; then
    mv "$temporary" "$target"
    return 0
  fi

  rm -f "$temporary"
  write_unavailable "$target" "$section"
  OPTIONAL_FAILURES=$((OPTIONAL_FAILURES + 1))
  log_warn "$section is unavailable; see $ERROR_LOG"
  return 0
}

aws_capture_in_region() {
  local section="$1"
  local target="$2"
  local region="$3"
  shift 3

  local temporary="${target}.tmp"
  log_info "Collecting $section ($region)"
  if aws "$@" \
    --profile "$AWS_PROFILE_NAME" \
    --region "$region" \
    --output json > "$temporary" 2>> "$ERROR_LOG"; then
    mv "$temporary" "$target"
    return 0
  fi

  rm -f "$temporary"
  write_unavailable "$target" "$section"
  OPTIONAL_FAILURES=$((OPTIONAL_FAILURES + 1))
  log_warn "$section is unavailable; see $ERROR_LOG"
  return 0
}

aws_capture_nullable() {
  local section="$1"
  local target="$2"
  shift 2

  local temporary="${target}.tmp"
  local error_file="${target}.error.tmp"
  log_info "Collecting $section"
  if aws "$@" \
    --profile "$AWS_PROFILE_NAME" \
    --region "$AWS_REGION_NAME" \
    --output json > "$temporary" 2> "$error_file"; then
    mv "$temporary" "$target"
    rm -f "$error_file"
    return 0
  fi

  rm -f "$temporary"
  if grep -Eq 'ResourceNotFoundException|PolicyNotFoundException|LifecyclePolicyNotFoundException' "$error_file"; then
    printf 'null\n' > "$target"
    rm -f "$error_file"
    log_info "$section is not configured"
    return 0
  fi

  cat "$error_file" >> "$ERROR_LOG"
  rm -f "$error_file"
  write_unavailable "$target" "$section"
  OPTIONAL_FAILURES=$((OPTIONAL_FAILURES + 1))
  log_warn "$section is unavailable; see $ERROR_LOG"
  return 0
}

authenticate() {
  local identity_file="$OUTPUT_DIR/00-identity.json"
  local temporary="${identity_file}.tmp"

  log_info "Checking AWS identity for profile $AWS_PROFILE_NAME"
  if aws sts get-caller-identity \
    --profile "$AWS_PROFILE_NAME" \
    --region "$AWS_REGION_NAME" \
    --output json > "$temporary" 2>> "$ERROR_LOG"; then
    mv "$temporary" "$identity_file"
    return 0
  fi

  rm -f "$temporary"
  [[ "$AUTO_SSO_LOGIN" == true ]] || die "AWS authentication failed; see $ERROR_LOG"

  log_warn "AWS session is unavailable or expired; starting SSO login"
  aws sso login --profile "$AWS_PROFILE_NAME" 2>> "$ERROR_LOG" || die "AWS SSO login failed; see $ERROR_LOG"

  aws sts get-caller-identity \
    --profile "$AWS_PROFILE_NAME" \
    --region "$AWS_REGION_NAME" \
    --output json > "$temporary" 2>> "$ERROR_LOG" || die "AWS identity check failed after SSO login"
  mv "$temporary" "$identity_file"
}

collect_identity_and_tags() {
  authenticate
  aws_capture "tagged resources" "$OUTPUT_DIR/01-tagged-resources.json" \
    resourcegroupstaggingapi get-resources \
    --resource-type-filters \
      ec2:instance ec2:security-group elasticloadbalancing:loadbalancer \
      rds:db rds:cluster lambda:function ecr:repository events:rule

  aws_capture "AWS Config recorders" "$OUTPUT_DIR/02-config-recorders.json" \
    configservice describe-configuration-recorders
  aws_capture "AWS Config recorder status" "$OUTPUT_DIR/03-config-recorder-status.json" \
    configservice describe-configuration-recorder-status
}

collect_ec2_and_network() {
  aws_capture "EC2 instance" "$OUTPUT_DIR/10-ec2.json" \
    ec2 describe-instances \
    --instance-ids "$EC2_INSTANCE_ID" \
    --query 'Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,Type:InstanceType,Architecture:Architecture,ImageId:ImageId,LaunchTime:LaunchTime,VpcId:VpcId,SubnetId:SubnetId,AvailabilityZone:Placement.AvailabilityZone,PrivateIp:PrivateIpAddress,PublicIp:PublicIpAddress,IamProfile:IamInstanceProfile.Arn,SecurityGroups:SecurityGroups,Volumes:BlockDeviceMappings,MetadataOptions:MetadataOptions,Monitoring:Monitoring.State,Tags:Tags}'

  local vpc_id
  vpc_id="$(jq -r 'if type == "array" then (.[0].VpcId // empty) else empty end' "$OUTPUT_DIR/10-ec2.json")"
  if [[ -z "$vpc_id" ]]; then
    log_warn "Cannot derive the VPC from $EC2_INSTANCE_ID; skipping VPC-scoped sections"
    OPTIONAL_FAILURES=$((OPTIONAL_FAILURES + 1))
    write_unavailable "$OUTPUT_DIR/11-vpc.json" "VPC"
    return 0
  fi

  printf '%s\n' "$vpc_id" > "$OUTPUT_DIR/vpc-id.txt"

  aws_capture "VPC" "$OUTPUT_DIR/11-vpc.json" \
    ec2 describe-vpcs --vpc-ids "$vpc_id"
  aws_capture "VPC subnets" "$OUTPUT_DIR/12-subnets.json" \
    ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc_id"
  aws_capture "VPC security groups" "$OUTPUT_DIR/13-security-groups.json" \
    ec2 describe-security-groups --filters "Name=vpc-id,Values=$vpc_id"
  aws_capture "VPC route tables" "$OUTPUT_DIR/14-route-tables.json" \
    ec2 describe-route-tables --filters "Name=vpc-id,Values=$vpc_id"
  aws_capture "VPC NAT gateways" "$OUTPUT_DIR/15-nat-gateways.json" \
    ec2 describe-nat-gateways --filter "Name=vpc-id,Values=$vpc_id"
  aws_capture "VPC internet gateways" "$OUTPUT_DIR/16-internet-gateways.json" \
    ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$vpc_id"
  aws_capture "EC2 elastic IPs" "$OUTPUT_DIR/17-elastic-ips.json" \
    ec2 describe-addresses \
    --query "Addresses[?InstanceId=='$EC2_INSTANCE_ID']"
  aws_capture "EC2 volumes" "$OUTPUT_DIR/18-volumes.json" \
    ec2 describe-volumes --filters "Name=attachment.instance-id,Values=$EC2_INSTANCE_ID"
  aws_capture "SSM managed-instance status" "$OUTPUT_DIR/19-ssm-instance.json" \
    ssm describe-instance-information \
    --filters "Key=InstanceIds,Values=$EC2_INSTANCE_ID"

  aws_capture "load balancers in the VPC" "$OUTPUT_DIR/17-load-balancers.json" \
    elbv2 describe-load-balancers \
    --query "LoadBalancers[?VpcId=='$vpc_id'].{Name:LoadBalancerName,Arn:LoadBalancerArn,Type:Type,Scheme:Scheme,DNSName:DNSName,State:State.Code,SecurityGroups:SecurityGroups,AvailabilityZones:AvailabilityZones}"
  aws_capture "target groups in the VPC" "$OUTPUT_DIR/18-target-groups.json" \
    elbv2 describe-target-groups \
    --query "TargetGroups[?VpcId=='$vpc_id'].{Name:TargetGroupName,Arn:TargetGroupArn,Protocol:Protocol,Port:Port,TargetType:TargetType,HealthPath:HealthCheckPath,LoadBalancerArns:LoadBalancerArns}"

  collect_instance_role
}

collect_instance_role() {
  local profile_arn profile_name role_name
  profile_arn="$(jq -r 'if type == "array" then (.[0].IamProfile // empty) else empty end' "$OUTPUT_DIR/10-ec2.json")"
  [[ -n "$profile_arn" ]] || return 0

  profile_name="${profile_arn##*/}"
  aws_capture "EC2 IAM instance profile" "$OUTPUT_DIR/07-ec2-instance-profile.json" \
    iam get-instance-profile --instance-profile-name "$profile_name"

  role_name="$(jq -r '.InstanceProfile.Roles[0].RoleName // empty' "$OUTPUT_DIR/07-ec2-instance-profile.json")"
  [[ -n "$role_name" ]] || return 0

  aws_capture "EC2 attached IAM policies" "$OUTPUT_DIR/08-ec2-attached-policies.json" \
    iam list-attached-role-policies --role-name "$role_name"
  aws_capture "EC2 inline IAM policy names" "$OUTPUT_DIR/09-ec2-inline-policies.json" \
    iam list-role-policies --role-name "$role_name"
}

collect_database() {
  aws_capture "RDS instances" "$OUTPUT_DIR/20-rds-instances.json" \
    rds describe-db-instances \
    --query 'DBInstances[].{Id:DBInstanceIdentifier,Arn:DBInstanceArn,Cluster:DBClusterIdentifier,Engine:Engine,Version:EngineVersion,Class:DBInstanceClass,Status:DBInstanceStatus,Endpoint:Endpoint,MultiAZ:MultiAZ,Public:PubliclyAccessible,Encrypted:StorageEncrypted,KmsKeyId:KmsKeyId,DeletionProtection:DeletionProtection,BackupDays:BackupRetentionPeriod,PreferredBackupWindow:PreferredBackupWindow,AutoMinorVersionUpgrade:AutoMinorVersionUpgrade,PerformanceInsightsEnabled:PerformanceInsightsEnabled,SubnetGroup:DBSubnetGroup,SecurityGroups:VpcSecurityGroups,ParameterGroups:DBParameterGroups,Tags:TagList}'

  aws_capture "RDS clusters" "$OUTPUT_DIR/21-rds-clusters.json" \
    rds describe-db-clusters \
    --query 'DBClusters[].{Id:DBClusterIdentifier,Arn:DBClusterArn,Engine:Engine,Version:EngineVersion,Mode:EngineMode,Status:Status,Endpoint:Endpoint,ReaderEndpoint:ReaderEndpoint,Port:Port,DatabaseName:DatabaseName,Members:DBClusterMembers,Encrypted:StorageEncrypted,KmsKeyId:KmsKeyId,DeletionProtection:DeletionProtection,BackupDays:BackupRetentionPeriod,PreferredBackupWindow:PreferredBackupWindow,ServerlessV2ScalingConfiguration:ServerlessV2ScalingConfiguration,SecurityGroups:VpcSecurityGroups,SubnetGroup:DBSubnetGroup,Tags:TagList}'

  aws_capture "RDS subnet groups" "$OUTPUT_DIR/22-rds-subnet-groups.json" \
    rds describe-db-subnet-groups
  aws_capture "RDS automated instance snapshots" "$OUTPUT_DIR/23-rds-instance-snapshots.json" \
    rds describe-db-snapshots --snapshot-type automated \
    --query 'DBSnapshots[].{Id:DBSnapshotIdentifier,DB:DBInstanceIdentifier,Created:SnapshotCreateTime,Status:Status,Engine:Engine,Encrypted:Encrypted,SnapshotType:SnapshotType}'
  aws_capture "RDS automated cluster snapshots" "$OUTPUT_DIR/24-rds-cluster-snapshots.json" \
    rds describe-db-cluster-snapshots --snapshot-type automated \
    --query 'DBClusterSnapshots[].{Id:DBClusterSnapshotIdentifier,Cluster:DBClusterIdentifier,Created:SnapshotCreateTime,Status:Status,Engine:Engine,Encrypted:StorageEncrypted,SnapshotType:SnapshotType}'
}

collect_lambda_and_events() {
  aws_capture "Lambda configuration (environment omitted)" "$OUTPUT_DIR/30-lambda.json" \
    lambda get-function-configuration \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --query '{Name:FunctionName,Arn:FunctionArn,Description:Description,Role:Role,Runtime:Runtime,PackageType:PackageType,Architectures:Architectures,Timeout:Timeout,Memory:MemorySize,EphemeralStorage:EphemeralStorage,CodeSize:CodeSize,CodeSha256:CodeSha256,Version:Version,LastModified:LastModified,State:State,LastUpdateStatus:LastUpdateStatus,Vpc:VpcConfig,Layers:Layers,DeadLetter:DeadLetterConfig,Tracing:TracingConfig,Logging:LoggingConfig,KmsKeyArn:KMSKeyArn}'

  aws_capture "Lambda environment variable names" "$OUTPUT_DIR/31-lambda-environment-keys.json" \
    lambda get-function-configuration \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --query 'keys(not_null(Environment.Variables, `{}`))'
  aws_capture "Lambda image metadata" "$OUTPUT_DIR/32-lambda-image.json" \
    lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" \
    --query 'Code.{RepositoryType:RepositoryType,ImageUri:ImageUri,ResolvedImageUri:ResolvedImageUri}'
  aws_capture "Lambda concurrency" "$OUTPUT_DIR/33-lambda-concurrency.json" \
    lambda get-function-concurrency --function-name "$LAMBDA_FUNCTION_NAME"
  aws_capture "Lambda event-source mappings" "$OUTPUT_DIR/34-lambda-event-sources.json" \
    lambda list-event-source-mappings --function-name "$LAMBDA_FUNCTION_NAME" \
    --query 'EventSourceMappings[].{UUID:UUID,EventSourceArn:EventSourceArn,State:State,BatchSize:BatchSize,MaximumRetryAttempts:MaximumRetryAttempts,FunctionArn:FunctionArn}'
  aws_capture_nullable "Lambda resource policy" "$OUTPUT_DIR/35-lambda-policy.json" \
    lambda get-policy --function-name "$LAMBDA_FUNCTION_NAME" \
    --query '{RevisionId:RevisionId,Policy:Policy}'
  aws_capture_nullable "Lambda URL configuration" "$OUTPUT_DIR/36-lambda-url.json" \
    lambda get-function-url-config --function-name "$LAMBDA_FUNCTION_NAME" \
    --query '{FunctionUrl:FunctionUrl,AuthType:AuthType,Cors:Cors,InvokeMode:InvokeMode}'

  local lambda_arn role_arn role_name
  lambda_arn="$(jq -r '.Arn // empty' "$OUTPUT_DIR/30-lambda.json")"
  role_arn="$(jq -r '.Role // empty' "$OUTPUT_DIR/30-lambda.json")"

  if [[ -n "$role_arn" ]]; then
    role_name="${role_arn##*/}"
    aws_capture "Lambda attached IAM policies" "$OUTPUT_DIR/37-lambda-attached-policies.json" \
      iam list-attached-role-policies --role-name "$role_name"
    aws_capture "Lambda inline IAM policy names" "$OUTPUT_DIR/38-lambda-inline-policies.json" \
      iam list-role-policies --role-name "$role_name"
  fi

  if [[ -z "$lambda_arn" ]]; then
    log_warn "Cannot derive Lambda ARN; skipping EventBridge target discovery"
    OPTIONAL_FAILURES=$((OPTIONAL_FAILURES + 1))
    write_unavailable "$OUTPUT_DIR/39-event-rule-names.json" "EventBridge rules"
    return 0
  fi

  aws_capture "EventBridge rules targeting Lambda" "$OUTPUT_DIR/39-event-rule-names.json" \
    events list-rule-names-by-target --target-arn "$lambda_arn"

  mkdir -p "$OUTPUT_DIR/eventbridge"
  local rule_name safe_name
  while IFS= read -r rule_name; do
    [[ -n "$rule_name" ]] || continue
    safe_name="$(printf '%s' "$rule_name" | tr -c 'A-Za-z0-9._-' '_')"
    aws_capture "EventBridge rule $rule_name" "$OUTPUT_DIR/eventbridge/${safe_name}-rule.json" \
      events describe-rule --name "$rule_name"
    aws_capture "EventBridge targets for $rule_name" "$OUTPUT_DIR/eventbridge/${safe_name}-targets.json" \
      events list-targets-by-rule --rule "$rule_name" \
      --query 'Targets[].{Id:Id,Arn:Arn,RoleArn:RoleArn,RetryPolicy:RetryPolicy,DeadLetterConfig:DeadLetterConfig}'
  done < <(jq -r '.RuleNames[]? // empty' "$OUTPUT_DIR/39-event-rule-names.json")
}

collect_edge_and_dns() {
  aws_capture "CloudFront distribution" "$OUTPUT_DIR/40-cloudfront.json" \
    cloudfront list-distributions \
    --query "DistributionList.Items[?DomainName=='$CLOUDFRONT_DOMAIN'].{Id:Id,Arn:ARN,Status:Status,Enabled:Enabled,Domain:DomainName,Aliases:Aliases.Items,HttpVersion:HttpVersion,PriceClass:PriceClass,WebACLId:WebACLId,Certificate:ViewerCertificate.ACMCertificateArn,MinimumProtocolVersion:ViewerCertificate.MinimumProtocolVersion,Origins:Origins.Items[].{Id:Id,Domain:DomainName,Path:OriginPath,ConnectionAttempts:ConnectionAttempts,ConnectionTimeout:ConnectionTimeout,OriginAccessControlId:OriginAccessControlId,CustomOriginConfig:CustomOriginConfig,S3OriginConfig:S3OriginConfig},DefaultBehavior:{Origin:DefaultCacheBehavior.TargetOriginId,ViewerProtocolPolicy:DefaultCacheBehavior.ViewerProtocolPolicy,AllowedMethods:DefaultCacheBehavior.AllowedMethods.Items,CachedMethods:DefaultCacheBehavior.AllowedMethods.CachedMethods.Items,Compress:DefaultCacheBehavior.Compress,CachePolicyId:DefaultCacheBehavior.CachePolicyId,OriginRequestPolicyId:DefaultCacheBehavior.OriginRequestPolicyId,ResponseHeadersPolicyId:DefaultCacheBehavior.ResponseHeadersPolicyId,FunctionAssociations:DefaultCacheBehavior.FunctionAssociations.Items,LambdaAssociations:DefaultCacheBehavior.LambdaFunctionAssociations.Items},Behaviors:CacheBehaviors.Items[].{Path:PathPattern,Origin:TargetOriginId,ViewerProtocolPolicy:ViewerProtocolPolicy,AllowedMethods:AllowedMethods.Items,CachedMethods:AllowedMethods.CachedMethods.Items,Compress:Compress,CachePolicyId:CachePolicyId,OriginRequestPolicyId:OriginRequestPolicyId,ResponseHeadersPolicyId:ResponseHeadersPolicyId,FunctionAssociations:FunctionAssociations.Items,LambdaAssociations:LambdaFunctionAssociations.Items}}"

  aws_capture "Route 53 hosted zones" "$OUTPUT_DIR/41-route53-zones.json" \
    route53 list-hosted-zones \
    --query 'HostedZones[].{Id:Id,Name:Name,PrivateZone:Config.PrivateZone,Comment:Config.Comment,RecordCount:ResourceRecordSetCount}'

  mkdir -p "$OUTPUT_DIR/route53"
  local zone_id zone_name safe_name
  while IFS=$'\t' read -r zone_id zone_name; do
    [[ -n "$zone_id" && -n "$zone_name" ]] || continue
    safe_name="$(printf '%s' "$zone_name" | tr -c 'A-Za-z0-9._-' '_')"
    aws_capture "Route 53 records for $zone_name" "$OUTPUT_DIR/route53/${safe_name}.json" \
      route53 list-resource-record-sets --hosted-zone-id "$zone_id" \
      --query "ResourceRecordSets[?Type=='A' || Type=='AAAA' || Type=='CNAME'].{Name:Name,Type:Type,AliasTarget:AliasTarget,TTL:TTL,Values:ResourceRecords[].Value}"
  done < <(jq -r '.[]? | [.Id, .Name] | @tsv' "$OUTPUT_DIR/41-route53-zones.json")

  aws_capture_in_region "ACM certificates" "$OUTPUT_DIR/42-acm-eu-south-1.json" "$AWS_REGION_NAME" \
    acm list-certificates \
    --query 'CertificateSummaryList[].{Arn:CertificateArn,Domain:DomainName,Status:Status,Type:Type,KeyAlgorithm:KeyAlgorithm,InUse:InUse,NotAfter:NotAfter}'
  aws_capture_in_region "CloudFront ACM certificates" "$OUTPUT_DIR/43-acm-us-east-1.json" "us-east-1" \
    acm list-certificates \
    --query 'CertificateSummaryList[].{Arn:CertificateArn,Domain:DomainName,Status:Status,Type:Type,KeyAlgorithm:KeyAlgorithm,InUse:InUse,NotAfter:NotAfter}'
}

collect_images_observability_and_secrets() {
  aws_capture "ECR repositories" "$OUTPUT_DIR/50-ecr-repositories.json" \
    ecr describe-repositories \
    --query 'repositories[].{Name:repositoryName,Arn:repositoryArn,Uri:repositoryUri,CreatedAt:createdAt,TagMutability:imageTagMutability,Scanning:imageScanningConfiguration,Encryption:encryptionConfiguration}'

  mkdir -p "$OUTPUT_DIR/ecr"
  local repository_name safe_name
  while IFS= read -r repository_name; do
    [[ "$repository_name" == *watchtower* ]] || continue
    safe_name="$(printf '%s' "$repository_name" | tr '/:' '__')"
    aws_capture "ECR images for $repository_name" "$OUTPUT_DIR/ecr/${safe_name}-images.json" \
      ecr describe-images --repository-name "$repository_name" \
      --query 'reverse(sort_by(imageDetails,& imagePushedAt))[:20].{Digest:imageDigest,Tags:imageTags,PushedAt:imagePushedAt,Size:imageSizeInBytes,ScanStatus:imageScanStatus.status,LastPull:imageLastRecordedPullTime}'
    aws_capture_nullable "ECR lifecycle for $repository_name" "$OUTPUT_DIR/ecr/${safe_name}-lifecycle.json" \
      ecr get-lifecycle-policy --repository-name "$repository_name" \
      --query '{RegistryId:registryId,RepositoryName:repositoryName,LastEvaluatedAt:lastEvaluatedAt,LifecyclePolicyText:lifecyclePolicyText}'
  done < <(jq -r '.[]?.Name // empty' "$OUTPUT_DIR/50-ecr-repositories.json")

  aws_capture "ECS clusters" "$OUTPUT_DIR/51-ecs-clusters.json" \
    ecs list-clusters
  aws_capture "CloudWatch log groups" "$OUTPUT_DIR/52-log-groups.json" \
    logs describe-log-groups --log-group-name-pattern watchtower \
    --query 'logGroups[].{Name:logGroupName,Arn:arn,Created:creationTime,RetentionDays:retentionInDays,StoredBytes:storedBytes,KmsKeyId:kmsKeyId,Class:logGroupClass}'
  aws_capture "CloudWatch alarms" "$OUTPUT_DIR/53-cloudwatch-alarms.json" \
    cloudwatch describe-alarms \
    --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Namespace:Namespace,Metric:MetricName,Dimensions:Dimensions,Period:Period,EvaluationPeriods:EvaluationPeriods,Threshold:Threshold,ComparisonOperator:ComparisonOperator,AlarmActions:AlarmActions,OKActions:OKActions,InsufficientDataActions:InsufficientDataActions}'
  aws_capture "Secrets Manager metadata" "$OUTPUT_DIR/54-secret-metadata.json" \
    secretsmanager list-secrets \
    --filters Key=name,Values=watchtower \
    --query 'SecretList[].{Name:Name,Arn:ARN,Description:Description,KmsKeyId:KmsKeyId,LastChangedDate:LastChangedDate,LastRotatedDate:LastRotatedDate,RotationEnabled:RotationEnabled,RotationRules:RotationRules,Tags:Tags}'
  aws_capture "SSM parameter metadata" "$OUTPUT_DIR/55-parameter-metadata.json" \
    ssm describe-parameters \
    --parameter-filters Key=Name,Option=Contains,Values=watchtower \
    --query 'Parameters[].{Name:Name,Arn:ARN,Type:Type,KeyId:KeyId,LastModifiedDate:LastModifiedDate,Version:Version,Tier:Tier,DataType:DataType}'
  aws_capture "AWS Backup vaults" "$OUTPUT_DIR/56-backup-vaults.json" \
    backup list-backup-vaults \
    --query 'BackupVaultList[].{Name:BackupVaultName,Arn:BackupVaultArn,Created:CreationDate,RecoveryPoints:NumberOfRecoveryPoints,EncryptionKeyArn:EncryptionKeyArn,Locked:Locked,MinRetentionDays:MinRetentionDays,MaxRetentionDays:MaxRetentionDays}'
  aws_capture "AWS Backup protected resources" "$OUTPUT_DIR/57-backup-protected-resources.json" \
    backup list-protected-resources \
    --query 'Results[].{Arn:ResourceArn,Name:ResourceName,Type:ResourceType,LastBackupTime:LastBackupTime}'
}

generate_manifest() {
  local generated_at account_id account_arn vpc_id
  generated_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  account_id="$(jq -r '.Account // "unknown"' "$OUTPUT_DIR/00-identity.json")"
  account_arn="$(jq -r '.Arn // "unknown"' "$OUTPUT_DIR/00-identity.json")"
  vpc_id="$(cat "$OUTPUT_DIR/vpc-id.txt" 2>/dev/null || true)"

  jq -n \
    --arg generatedAt "$generated_at" \
    --arg profile "$AWS_PROFILE_NAME" \
    --arg region "$AWS_REGION_NAME" \
    --arg accountId "$account_id" \
    --arg accountArn "$account_arn" \
    --arg instanceId "$EC2_INSTANCE_ID" \
    --arg vpcId "$vpc_id" \
    --arg lambdaFunction "$LAMBDA_FUNCTION_NAME" \
    --arg cloudFrontDomain "$CLOUDFRONT_DOMAIN" \
    --argjson unavailableSections "$OPTIONAL_FAILURES" \
    '{
      generatedAt:$generatedAt,
      mode:"read-only",
      profile:$profile,
      region:$region,
      account:{id:$accountId, arn:$accountArn},
      resources:{
        ec2InstanceId:$instanceId,
        vpcId:$vpcId,
        lambdaFunction:$lambdaFunction,
        cloudFrontDomain:$cloudFrontDomain
      },
      unavailableSections:$unavailableSections,
      intentionallyOmitted:[
        "Secrets Manager secret values",
        "SSM parameter values",
        "Lambda environment variable values",
        "EC2 user data",
        "database credentials",
        "CloudFront origin custom-header values"
      ]
    }' > "$OUTPUT_DIR/manifest.json"
}

generate_summary() {
  local account_id vpc_id ec2_state ec2_type ec2_public_ip
  local lambda_package lambda_runtime lambda_vpc event_rule_count
  local distribution_id rds_instance_count rds_cluster_count nat_count

  account_id="$(jq -r '.Account // "unknown"' "$OUTPUT_DIR/00-identity.json")"
  vpc_id="$(cat "$OUTPUT_DIR/vpc-id.txt" 2>/dev/null || printf 'unknown')"
  ec2_state="$(jq -r 'if type == "array" then (.[0].State // "unknown") else "unavailable" end' "$OUTPUT_DIR/10-ec2.json")"
  ec2_type="$(jq -r 'if type == "array" then (.[0].Type // "unknown") else "unavailable" end' "$OUTPUT_DIR/10-ec2.json")"
  ec2_public_ip="$(jq -r 'if type == "array" then (.[0].PublicIp // "none") else "unavailable" end' "$OUTPUT_DIR/10-ec2.json")"
  lambda_package="$(jq -r '.PackageType // "unavailable"' "$OUTPUT_DIR/30-lambda.json")"
  lambda_runtime="$(jq -r '.Runtime // "n/a (container image)"' "$OUTPUT_DIR/30-lambda.json")"
  lambda_vpc="$(jq -r '(.Vpc.VpcId // "none") as $vpc | ((.Vpc.SubnetIds // []) | length) as $subnets | "\($vpc), \($subnets) subnet(s)"' "$OUTPUT_DIR/30-lambda.json" 2>/dev/null || printf 'unavailable')"
  event_rule_count="$(jq -r '(.RuleNames // []) | length' "$OUTPUT_DIR/39-event-rule-names.json" 2>/dev/null || printf '0')"
  distribution_id="$(jq -r 'if type == "array" then (.[0].Id // "not found") else "unavailable" end' "$OUTPUT_DIR/40-cloudfront.json")"
  rds_instance_count="$(jq -r 'if type == "array" then length else 0 end' "$OUTPUT_DIR/20-rds-instances.json")"
  rds_cluster_count="$(jq -r 'if type == "array" then length else 0 end' "$OUTPUT_DIR/21-rds-clusters.json")"
  nat_count="$(jq -r '(.NatGateways // []) | map(select(.State != "deleted")) | length' "$OUTPUT_DIR/15-nat-gateways.json" 2>/dev/null || printf '0')"

  {
    printf '# AWS Inventory - Go Watchtower\n\n'
    printf -- '- Generated: `%s`\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    printf -- '- Account: `%s`\n' "$account_id"
    printf -- '- Profile: `%s`\n' "$AWS_PROFILE_NAME"
    printf -- '- Region: `%s`\n' "$AWS_REGION_NAME"
    printf -- '- Mode: read-only\n'
    printf -- '- Unavailable sections: `%s`\n\n' "$OPTIONAL_FAILURES"

    printf '## Core resources\n\n'
    printf '| Resource | Identifier | Key configuration |\n'
    printf '|---|---|---|\n'
    printf '| EC2 | `%s` | state `%s`, type `%s`, public IP `%s` |\n' "$EC2_INSTANCE_ID" "$ec2_state" "$ec2_type" "$ec2_public_ip"
    printf '| VPC | `%s` | active NAT gateways `%s` |\n' "$vpc_id" "$nat_count"
    printf '| Lambda | `%s` | package `%s`, runtime `%s`, VPC `%s` |\n' "$LAMBDA_FUNCTION_NAME" "$lambda_package" "$lambda_runtime" "$lambda_vpc"
    printf '| EventBridge | Lambda target | `%s` rule(s) |\n' "$event_rule_count"
    printf '| CloudFront | `%s` | distribution `%s` |\n' "$CLOUDFRONT_DOMAIN" "$distribution_id"
    printf '| RDS | account/region scan | `%s` instance(s), `%s` cluster(s) |\n\n' "$rds_instance_count" "$rds_cluster_count"

    printf '## Review checklist\n\n'
    printf -- '- [ ] Confirm the exact RDS/Aurora resource used by `DATABASE_URL`.\n'
    printf -- '- [ ] Verify RDS encryption, deletion protection, backup retention, and latest automated snapshot.\n'
    printf -- '- [ ] Classify public/private subnets from route-table targets.\n'
    printf -- '- [ ] Verify security-group paths: CloudFront/Internet -> EC2 and EC2/Lambda -> RDS.\n'
    printf -- '- [ ] Verify that Lambda has outbound Internet access to Slack from its configured subnets.\n'
    printf -- '- [ ] Confirm the CloudFront behavior and origin used for `/bff/*`.\n'
    printf -- '- [ ] Confirm EventBridge schedule, retry policy, dead-letter queue, and Lambda concurrency.\n'
    printf -- '- [ ] Verify ECR tag mutability, image scanning, and lifecycle policies.\n'
    printf -- '- [ ] Verify CloudWatch log retention and alarms.\n'
    printf -- '- [ ] Record resource owner and whether each resource will be referenced, imported, or replaced by SST.\n\n'

    printf '## Sensitive data policy\n\n'
    printf 'Secret values, decrypted parameters, Lambda environment values, database credentials, EC2 user data, and CloudFront custom-header values were intentionally omitted.\n'
  } > "$OUTPUT_DIR/summary.md"
}

main() {
  log_info "Starting read-only AWS inventory"
  log_info "Output directory: $OUTPUT_DIR"

  collect_identity_and_tags
  collect_ec2_and_network
  collect_database
  collect_lambda_and_events
  collect_edge_and_dns
  collect_images_observability_and_secrets
  generate_manifest
  generate_summary

  if [[ ! -s "$ERROR_LOG" ]]; then
    rm -f "$ERROR_LOG"
  fi

  log_info "Inventory complete: $OUTPUT_DIR"
  log_info "Start with: $OUTPUT_DIR/summary.md"

  if [[ $OPTIONAL_FAILURES -gt 0 ]]; then
    log_warn "$OPTIONAL_FAILURES section(s) were unavailable; inventory is partial"
    return 2
  fi
}

main "$@"
