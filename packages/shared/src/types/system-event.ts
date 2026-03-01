export interface SystemEvent {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  resourceLabel: string | null;
  userId: string | null;
  userLabel: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface SystemEventsResponse {
  data: SystemEvent[];
  total: number;
  page: number;
  totalPages: number;
}
