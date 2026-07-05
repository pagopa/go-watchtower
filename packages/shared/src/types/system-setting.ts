import type { SettingType } from "../constants/setting-types.js";
import type { SettingCategory } from "../constants/setting-categories.js";
import type {
  SettingFormat,
  FkSettingFormat,
} from "../constants/setting-formats.js";
import type { WorkingHours } from "./working-hours.js";
import type { OnCallHours } from "./on-call-hours.js";
import type { SlackIngestorControl } from "./slack-ingestor-automation.js";

interface SystemSettingBase {
  id: string;
  key: string;
  type: SettingType;
  format: SettingFormat | null;
  category: SettingCategory;
  label: string;
  description: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenericSystemSetting extends SystemSettingBase {
  format: null;
  value: unknown;
}

export interface WorkingHoursSystemSetting extends SystemSettingBase {
  type: "JSON";
  format: "WORKING_HOURS";
  value: WorkingHours;
}

export interface OnCallHoursSystemSetting extends SystemSettingBase {
  type: "JSON";
  format: "ON_CALL_HOURS";
  value: OnCallHours;
}

export interface SlackIngestorControlSystemSetting extends SystemSettingBase {
  type: "JSON";
  format: "SLACK_INGESTOR_CONTROL";
  value: SlackIngestorControl;
}

export interface FkSystemSetting<
  TFormat extends FkSettingFormat = FkSettingFormat,
> extends SystemSettingBase {
  type: "STRING";
  format: TFormat;
  value: string;
}

/** Alias nominale per documentazione */
export type RoleFkSystemSetting = FkSystemSetting<"FK_ROLE">;

export type SystemSetting =
  | GenericSystemSetting
  | WorkingHoursSystemSetting
  | OnCallHoursSystemSetting
  | SlackIngestorControlSystemSetting
  | FkSystemSetting;
