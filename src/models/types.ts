export interface Table {
  id: number;
  name: string;
  status: 'active' | 'inactive';
}

export interface ServiceRequest {
  id: string;
  tableId: number;
  type: RequestType;
  status: RequestStatus;
  timestamp: Date;
  acknowledgedBy: string | null;
  customNote?: string;
}

export type RequestType = 'call_waiter' | 'bill' | 'assistance' | 'custom';
export type RequestStatus = 'pending' | 'acknowledged' | 'completed' | 'cancelled';

export interface RequestTypeConfig {
  id: string;
  tenantId: string;
  nameEn: string;
  nameAr: string;
  icon: string;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CallWaiterData {
  tableId: number;
  type?: RequestType;
  customNote?: string;
}

export interface ServerToClientEvents {
  new_request: (request: ServiceRequest) => void;
  request_sent: (request: ServiceRequest) => void;
  request_updated: (request: ServiceRequest) => void;
  request_status: (request: ServiceRequest) => void;
  error: (message: string) => void;
  auth_error: (error: { code: string; message: string; details: string }) => void;
}

export interface ClientToServerEvents {
  join: (room: string) => void;
  call_waiter: (data: CallWaiterData) => void;
  acknowledge_request: (requestId: string) => void;
  complete_request: (requestId: string) => void;
  cancel_request: (requestId: string) => void;
}
