export type EmailConfig = {
  enabled: boolean;
  from: string;
  adminEmail?: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
  };
  notifyBatch: boolean;
  notifyPassword: boolean;
};

export type StoredEmailConfig = {
  enabled?: boolean;
  from?: string;
  adminEmail?: string;
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
  };
  notifyBatch?: boolean;
  notifyPassword?: boolean;
};

export type PublicEmailConfig = {
  persisted: boolean;
  enabled: boolean;
  from: string;
  adminEmail?: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    hasPassword: boolean;
  };
  notifyBatch: boolean;
  notifyPassword: boolean;
};
