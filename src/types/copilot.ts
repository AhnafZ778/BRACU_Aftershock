export interface CopilotForecastPoint {
  lat: number;
  lon: number;
  hour_offset: number;
  wind_kt: number;
}

export interface CopilotForecastBranch {
  id: string;
  label: string;
  confidence: number;
  landfall_window: string;
  rationale: string;
  points: CopilotForecastPoint[];
  uncertainty_radius_km_by_lead?: Record<string, number>;
  calibration_source_version?: string;
}

export type CopilotRiskBand = 'critical' | 'high' | 'moderate' | 'low';
export type WarningGapBand = 'likely_reached' | 'partial_reach' | 'unverified_gap';

export interface CopilotLocalityProjection {
  locality_code: string;
  locality_name: string;
  district_name: string;
  lat: number;
  lon: number;
  current_risk: number;
  projected_risk: number;
  projected_delta: number;
  risk_band: CopilotRiskBand;
  warning_gap_band: WarningGapBand;
  warning_gap_rationale: string;
  warning_confidence: number;
  warning_gap_score: number;
  channel_plan: string[];
  channel_rationale: string;
  action_timeline: Record<string, string>;
  explanation: string;
}

export interface CapAlertPreview {
  event: string;
  urgency: string;
  severity: string;
  certainty: string;
  area: string[];
  headline: string;
  description: string;
  instructions: string;
  channel_plan: string[];
  sender: string;
  msg_type: string;
  note: string;
}

export interface CapValidationIssue {
  code: string;
  message: string;
}

export interface CapValidation {
  status: 'valid' | 'warning' | 'blocked';
  issues: CapValidationIssue[];
}

export interface CopilotWarningGapSummary {
  likely_reached: number;
  partial_reach: number;
  unverified_gap: number;
}

export interface CopilotForecastProvenance {
  source: string;
  freshness_minutes: number | null;
  observation_count: number;
  source_count: number;
  reason_codes: string[];
  latest_observation_time: string | null;
}

export interface CopilotState {
  event_id: string;
  event_name: string;
  step_index: number;
  storm_center: [number, number];
  selected_branch_id: string;
  generated_at: string;
  forecast_branches: CopilotForecastBranch[];
  top_localities: CopilotLocalityProjection[];
  warning_gap_summary: CopilotWarningGapSummary;
  cap_alert_preview: CapAlertPreview;
  cap_validation: CapValidation;
  operational_summary: string;
  deterministic: boolean;
  ai_enhanced: boolean;
  forecast_mode: 'historical_replay' | 'live_forecast' | 'synthetic_scenario' | 'unknown';
  forecast_confidence: number;
  forecast_provenance: CopilotForecastProvenance;
  diagnostics: Record<string, unknown>;
}

export interface CopilotStateRequest {
  event_id: string;
  step_index: number;
  selected_branch_id?: string;
  ai_enhance?: boolean;
}

export interface DisseminationRequest {
  locality_name: string;
  district_name: string;
  risk_level: string;
  hazard_type: string;
  ai_enhanced?: boolean;
  adjacent_zone_labels?: string[];
  periphery_summary?: string;
  nearest_volunteer_summary?: string[];
}

export interface DisseminationAction {
  action_text: string;
  urgency: string;
  severity: string;
  channels: string[];
}

export interface DisseminationResponse {
  locality: string;
  risk_level: string;
  hazard_type: string;
  action: DisseminationAction;
  ai_used: boolean;
  generated_at: string;
}

